import type { TerraformResourceOutput } from '../app.type.js';
import type { App } from '../models/app/app.model.js';
import {
  ExternalIgwResource,
  ReplacingTfVpcResource,
  TestModes,
  TfSgResource,
  TfVpcResource,
} from '../utilities/test-helpers/test-modes.js';
import { commitResources } from '../utilities/test-helpers/test-resources.js';
import { applyModelTransaction } from './apply-transaction.js';
import { validate } from './validate.mode.js';

describe('validate()', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  const noPersisted = (): Map<string, TerraformResourceOutput> => new Map();

  /**
   * The mapping a commit of the standard `vpc → igw → sg` graph would have written. Pass this
   * whenever a test is about drift: a producer missing from the persisted mapping is one terragrunt
   * can only supply from `mock_outputs`, so validate downgrades its consumers to `uncertain`.
   */
  const persistedGraph = ({ omit }: { omit?: ('igw-1' | 'sg-1' | 'vpc-1')[] } = {}): Map<
    string,
    TerraformResourceOutput
  > => {
    const entries: TerraformResourceOutput[] = [
      {
        moduleId: 'region-module',
        resourceContext: '@octo/tf-vpc=vpc-1',
        resourceId: 'vpc-1',
        terraformAddresses: ['aws_vpc.vpc-1'],
      },
      {
        moduleId: 'region-module',
        resourceContext: '@octo/sdk-igw=igw-1',
        resourceId: 'igw-1',
        terraformAddresses: ['null_resource.igw-1'],
      },
      {
        moduleId: 'sg-module',
        resourceContext: '@octo/tf-sg=sg-1',
        resourceId: 'sg-1',
        terraformAddresses: ['aws_security_group.sg-1'],
      },
    ];
    return new Map(
      entries
        .filter((entry) => !(omit ?? []).includes(entry.resourceId as 'igw-1' | 'sg-1' | 'vpc-1'))
        .map((entry) => [entry.resourceContext, entry]),
    );
  };

  // Re-creates the committed full graph in memory with vpc-1 changed, so vpc-1 updates and the change
  // cascades an update onto its direct child igw-1 (sg-1 stays unchanged).
  async function recreateGraph({ changeVpc }: { changeVpc?: boolean } = {}): Promise<void> {
    const vpc2 = new TfVpcResource('vpc-1', { CidrBlock: changeVpc ? '10.1.0.0/16' : '10.0.0.0/16' });
    const igw2 = new ExternalIgwResource('igw-1', { Type: 'internet-gateway' }, [vpc2]);
    const secGroup2 = new TfSgResource('sg-1', {}, [igw2]);
    testModes.resourceDataRepository.addNewResource(vpc2);
    testModes.resourceDataRepository.addNewResource(igw2);
    testModes.resourceDataRepository.addNewResource(secGroup2);
  }

  // Re-stages the replaceable graph with vpc-1 changed, so vpc-1 emits a REPLACE that (in terraform)
  // recreates the resources referencing it.
  async function recreateReplaceableGraph(): Promise<void> {
    const vpc2 = new ReplacingTfVpcResource('vpc-1', { CidrBlock: '10.1.0.0/16' });
    const igw2 = new ExternalIgwResource('igw-1', { Type: 'internet-gateway' }, [vpc2]);
    const secGroup2 = new TfSgResource('sg-1', {}, [igw2]);
    testModes.resourceDataRepository.addNewResource(vpc2);
    testModes.resourceDataRepository.addNewResource(igw2);
    testModes.resourceDataRepository.addNewResource(secGroup2);
  }

  // validate() consumes a prebuilt transaction. Build it from
  // the staged graph the way each mode does internally, then run validate against it.
  const runValidate = async (
    app: App,
    options: Omit<Parameters<typeof validate>[0], 'transaction'>,
  ): ReturnType<typeof validate> => {
    const transaction = await applyModelTransaction(app);
    return validate({ ...options, transaction });
  };

  // Stages a committed full graph, then re-creates a desired graph of just vpc-1 so igw-1 and sg-1
  // are deletes. Returns the app handle plus the persisted mapping the last commit would have written.
  async function stageDeletedIgwAndSg(): Promise<{ app: App; persisted: Map<string, TerraformResourceOutput> }> {
    const { app, igw, sg } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));

    const persisted = new Map<string, TerraformResourceOutput>([
      [
        igw.getContext(),
        {
          moduleId: 'region-module',
          resourceContext: igw.getContext(),
          resourceId: 'igw-1',
          terraformAddresses: ['null_resource.igw-1'],
        },
      ],
      [
        sg.getContext(),
        {
          moduleId: 'sg-module',
          resourceContext: sg.getContext(),
          resourceId: 'sg-1',
          terraformAddresses: ['aws_security_group.sg-1'],
        },
      ],
    ]);
    return { app, persisted };
  }

  // The six cases of the report, one describe each. Together they cover every outcome validate can
  // produce for a resource octo renders.

  describe('case A — a fresh apply', () => {
    it('reports every octo add against the terraform create it produces', async () => {
      const { app } = await testModes.createResourceGraph();

      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.intentChanges.map((c) => [c.resourceId, c.octoAction, c.terraformChanges.length])).toEqual([
        ['vpc-1', 'add', 1],
        ['igw-1', 'add', 1],
        ['sg-1', 'add', 1],
      ]);
    });
  });

  describe('case B — re-applying identical intent', () => {
    it('reports nothing at all, at exact confidence', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph();

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report).toEqual(
        expect.objectContaining({
          attributedChanges: [],
          confidence: 'exact',
          drift: [],
          failures: [],
          intentChanges: [],
          uncertain: [],
        }),
      );
    });
  });

  describe('case C — infrastructure changed outside octo', () => {
    it('reports a terraform change nothing in intent explains as drift', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph(); // identical graph → no octo diff, but vpc-1 stays in the mapping

      testModes.writePlan('region-module', [
        { actions: ['update'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([{ address: 'aws_vpc.vpc-1', moduleId: 'region-module', tfActions: ['update'] }]);
      // Intent is unchanged, which is exactly the regime in which drift can be believed.
      expect(report.confidence).toBe('exact');
    });

    it('reports a change on an address no octo resource owns as drift', async () => {
      const { app } = await testModes.createResourceGraph();

      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
        { actions: ['delete'], address: 'aws_instance.rogue' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.drift).toEqual([
        { address: 'aws_instance.rogue', moduleId: 'region-module', tfActions: ['delete'] },
      ]);
    });
  });

  describe('case D — an intent change terraform agrees with', () => {
    it('correlates the octo update with the in-place terraform update', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph({ changeVpc: true });

      testModes.writePlan('region-module', [
        { actions: ['update'], address: 'aws_vpc.vpc-1' },
        { actions: ['update'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.intentChanges.find((c) => c.resourceId === 'vpc-1')!.terraformChanges).toEqual([
        { address: 'aws_vpc.vpc-1', changedFields: [], tfActions: ['update'] },
      ]);
      // Intent moved, so cross-folder consequences of it cannot be seen in a per-folder plan.
      expect(report.confidence).toBe('approximate');
    });

    it('records what octo said and what terraform said without judging either', async () => {
      const { app } = await testModes.createReplaceableResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateReplaceableGraph();

      // octo declared a REPLACE; terraform only plans an in-place update. The report records both
      // rather than requiring them to agree.
      testModes.writePlan('region-module', [
        { actions: ['update'], address: 'aws_vpc.vpc-1' },
        { actions: ['update'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.intentChanges.find((c) => c.resourceId === 'vpc-1')).toEqual(
        expect.objectContaining({
          octoAction: 'replace',
          terraformChanges: [{ address: 'aws_vpc.vpc-1', changedFields: [], tfActions: ['update'] }],
        }),
      );
    });
  });

  describe('case E — an intent change with no infrastructure cost', () => {
    it('reports the octo diff with no terraform change, and does not fail', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph({ changeVpc: true });

      // The module author judged this diff-worthy; terraform judged it free. Both are right.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.intentChanges.find((c) => c.resourceId === 'vpc-1')!.terraformChanges).toEqual([]);
    });
  });

  describe('case F — a terraform change octo can attribute', () => {
    it('attributes a cascade on a referrer with no octo diff to the identity that moved', async () => {
      const { app } = await testModes.createReplaceableResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateReplaceableGraph();

      // sg-1 has no octo diff of its own, but terraform recreates it because it transitively
      // references the replaced vpc-1, so it is attributed rather than reported as drift.
      testModes.writePlan('region-module', [
        { actions: ['create', 'delete'], address: 'aws_vpc.vpc-1' },
        { actions: ['update'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['create', 'delete'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.attributedChanges).toEqual([
        {
          address: 'aws_security_group.sg-1',
          causeKind: 'identity-changed',
          causeResourceId: 'igw-1',
          moduleId: 'sg-module',
          tfActions: ['create', 'delete'],
        },
      ]);
    });

    it('attributes a destroy of an address the owning resource no longer renders', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph({ changeVpc: true });

      // One octo resource can render a variable number of terraform addresses (a rule per security
      // group rule, an object per website file). The last commit recorded an extra address that this
      // render dropped; terraform destroys it. Nobody tampered with anything.
      const persisted = persistedGraph();
      persisted.get('@octo/tf-vpc=vpc-1')!.terraformAddresses = ['aws_vpc.vpc-1', 'aws_vpc_ipv4_cidr.vpc-1_extra_1'];

      testModes.writePlan('region-module', [
        { actions: ['update'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'aws_vpc_ipv4_cidr.vpc-1_extra_1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persisted, plans: testModes.plans });

      expect(report.drift).toEqual([]);
      expect(report.attributedChanges).toEqual([
        {
          address: 'aws_vpc_ipv4_cidr.vpc-1_extra_1',
          causeKind: 'address-no-longer-rendered',
          causeResourceId: 'vpc-1',
          moduleId: 'region-module',
          tfActions: ['delete'],
        },
      ]);
    });
  });

  describe('mocked values are never reported as drift', () => {
    it('downgrades a consumer of a never-applied producer to uncertain', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph();

      // igw-1 is absent from the last commit, so its output name cannot be in the producer folder's
      // state and terragrunt substitutes a `mock_outputs` placeholder. sg-1 reads that output across
      // a folder boundary, so its plan was computed against a value that is not the real one.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['update'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, {
        persistedMappings: persistedGraph({ omit: ['igw-1'] }),
        plans: testModes.plans,
      });

      expect(report.drift).toEqual([]);
      expect(report.uncertain).toEqual([
        {
          address: 'aws_security_group.sg-1',
          moduleId: 'sg-module',
          reason: expect.stringContaining('igw-1'),
          tfActions: ['update'],
        },
      ]);
    });

    it('still reports drift on a resource fed only by applied producers', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph();

      // Same omission as above, but the change is on vpc-1, which consumes nothing. The mock
      // downgrade must not spread to a resource no mock could have reached.
      testModes.writePlan('region-module', [
        { actions: ['update'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, {
        persistedMappings: persistedGraph({ omit: ['igw-1'] }),
        plans: testModes.plans,
      });

      expect(report.uncertain).toEqual([]);
      expect(report.drift).toEqual([{ address: 'aws_vpc.vpc-1', moduleId: 'region-module', tfActions: ['update'] }]);
    });
  });

  describe('deleted octo resources', () => {
    it('correlates a delete against the addresses recorded at the last commit', async () => {
      const { app, persisted } = await stageDeletedIgwAndSg();

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['delete'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, {
        persistedMappings: persisted,
        plans: testModes.plans,
        previousFolders: [{ hasExternalResources: false, moduleId: 'sg-module', providers: [] }],
      });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.notes).toEqual([]);
      expect(report.intentChanges.filter((c) => c.octoAction === 'delete')).toEqual([
        expect.objectContaining({
          resourceId: 'igw-1',
          terraformChanges: [{ address: 'null_resource.igw-1', changedFields: [], tfActions: ['delete'] }],
        }),
        expect.objectContaining({
          resourceId: 'sg-1',
          terraformChanges: [{ address: 'aws_security_group.sg-1', changedFields: [], tfActions: ['delete'] }],
        }),
      ]);
    });

    it('treats a delete terraform plans nothing for as intent catching up with reality', async () => {
      const { app, persisted } = await stageDeletedIgwAndSg();

      // The resource is already gone from the cloud, so there is nothing left to destroy.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);

      const report = await runValidate(app, { persistedMappings: persisted, plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.intentChanges.find((c) => c.resourceId === 'igw-1')!.terraformChanges).toEqual([]);
    });

    it('notes, rather than judges, a delete whose folder plan was not supplied', async () => {
      const { app, persisted } = await stageDeletedIgwAndSg();

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);

      const report = await runValidate(app, { persistedMappings: persisted, plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.notes.some((n) => n.message.includes('sg-1') && n.message.includes('sg-module'))).toBe(true);
    });

    it('notes a delete with no persisted mapping, and does not blame it for an unclaimed destroy', async () => {
      const { app } = await stageDeletedIgwAndSg();

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);

      const report = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.notes.some((n) => n.message.includes('igw-1') && n.message.includes('persisted'))).toBe(true);
      expect(report.notes.some((n) => n.message.includes('null_resource.igw-1'))).toBe(true);
    });

    it('does not let a deleted resource claim a destroy on a similarly-named address', async () => {
      const { app, persisted } = await stageDeletedIgwAndSg();

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
        { actions: ['delete'], address: 'null_resource.igw-10' },
      ]);

      const report = await runValidate(app, { persistedMappings: persisted, plans: testModes.plans });

      expect(report.drift).toEqual([
        { address: 'null_resource.igw-10', moduleId: 'region-module', tfActions: ['delete'] },
      ]);
    });
  });

  describe('which arguments moved', () => {
    it('names the members of a list block, so an added index differs from a removed one', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph({ changeVpc: true });

      testModes.writePlan('region-module', [
        {
          actions: ['update'],
          address: 'aws_vpc.vpc-1',
          after: { global_secondary_index: [{ name: 'ByUser' }, { name: 'ByEmail' }] },
          // Structure, not a signal: a mark mirrors the value's shape, so empty objects mark nothing.
          afterSensitive: [{}, {}],
          afterUnknown: [{}, {}],
          before: { global_secondary_index: [{ name: 'ByUser' }] },
          beforeSensitive: [{}],
        },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.intentChanges.find((c) => c.resourceId === 'vpc-1')!.terraformChanges[0].changedFields).toEqual([
        { field: 'global_secondary_index', from: 'ByUser', to: 'ByUser, ByEmail' },
      ]);
    });

    it('redacts a value terraform actually marked sensitive', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateGraph({ changeVpc: true });

      testModes.writePlan('region-module', [
        {
          actions: ['update'],
          address: 'aws_vpc.vpc-1',
          after: { secret: 'new' },
          afterSensitive: { secret: true },
          before: { secret: 'old' },
          beforeSensitive: { secret: true },
        },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, { persistedMappings: persistedGraph(), plans: testModes.plans });

      expect(report.intentChanges.find((c) => c.resourceId === 'vpc-1')!.terraformChanges[0].changedFields).toEqual([
        { field: 'secret', from: '(sensitive)', to: '(sensitive)' },
      ]);
    });
  });

  describe('external resources published but not recorded', () => {
    // The plans of the standard graph, so the report is about the records and nothing else.
    const writeFreshPlans = (): void => {
      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);
    };

    it('notes nothing when no record is outstanding', async () => {
      const { app } = await testModes.createResourceGraph();
      writeFreshPlans();

      const report = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });

      expect(report.notes).toEqual([]);
    });

    it('notes that the next commit records a published resource intent still declares', async () => {
      const { app } = await testModes.createResourceGraph();
      writeFreshPlans();

      const report = await runValidate(app, {
        externalResourceStateIds: ['igw-1'],
        persistedMappings: noPersisted(),
        plans: testModes.plans,
      });

      expect(report.notes).toEqual([
        {
          message:
            'External resource "igw-1" is published and octo state has not recorded it; the next successful ' +
            'commit records it.',
        },
      ]);
    });

    // The resource is being deleted, so it is gone from intent but the committed graph still holds
    // it - which is what the commit computes its deletion from.
    it('notes that the next commit records a published resource only the committed graph holds', async () => {
      const { app, persisted } = await stageDeletedIgwAndSg();

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['delete'], address: 'aws_security_group.sg-1' }]);

      const report = await runValidate(app, {
        externalResourceStateIds: ['igw-1'],
        persistedMappings: persisted,
        plans: testModes.plans,
      });

      // Emptied folders note things of their own, so this asserts the record's note among them.
      expect(report.notes).toContainEqual({
        message:
          'External resource "igw-1" is published and octo state has not recorded it; the next successful ' +
          'commit records it.',
      });
    });

    it('notes that octo never deletes a published resource neither graph declares', async () => {
      const { app } = await testModes.createResourceGraph();
      writeFreshPlans();

      const report = await runValidate(app, {
        externalResourceStateIds: ['igw-0abandoned'],
        persistedMappings: noPersisted(),
        plans: testModes.plans,
      });

      expect(report.notes).toEqual([
        {
          message:
            'External resource "igw-0abandoned" is published and octo state has not recorded it, and neither ' +
            'intent nor the committed graph declares it any more. Octo never deletes it, because it never entered ' +
            'the committed graph. Declare it again to let the next commit adopt it, or delete it yourself and ' +
            'clear its record from octo state.',
        },
      ]);
    });

    it('notes every outstanding record, by resource id', async () => {
      const { app } = await testModes.createResourceGraph();
      writeFreshPlans();

      const report = await runValidate(app, {
        externalResourceStateIds: ['igw-2abandoned', 'igw-1', 'igw-0abandoned'],
        persistedMappings: noPersisted(),
        plans: testModes.plans,
      });

      expect(report.notes.map((note) => note.message.split('"')[1])).toEqual([
        'igw-0abandoned',
        'igw-1',
        'igw-2abandoned',
      ]);
    });
  });

  describe('folders octo cannot report on', () => {
    it("fails with terraform's own message when a folder could not be planned", async () => {
      const { app } = await testModes.createResourceGraph();

      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);

      const report = await runValidate(app, {
        persistedMappings: noPersisted(),
        planErrors: new Map([['sg-module', 'Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set']]),
        plans: testModes.plans,
      });

      expect(report.failures).toEqual([
        {
          message:
            'Terraform failed to plan module "sg-module":\n' +
            'Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set',
          moduleId: 'sg-module',
        },
      ]);
    });

    it('fails plainly when a folder was never inspected at all', async () => {
      const { app } = await testModes.createResourceGraph();

      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);

      const report = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });

      expect(report.failures).toEqual([
        {
          message: 'No terraform plan was supplied for module "sg-module", so octo cannot report on it.',
          moduleId: 'sg-module',
        },
      ]);
    });

    it('notes and excludes a plan supplied for a folder octo does not track', async () => {
      const { app } = await testModes.createResourceGraph();

      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);
      // A folder octo never wrote, so its changes are excluded from the report.
      testModes.writePlan('user-module', [{ actions: ['create'], address: 'aws_instance.hand-written' }]);

      const report = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });

      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      expect(report.notes.some((n) => n.message.includes('folder "user-module", which octo does not track'))).toBe(
        true,
      );
    });
  });
});
