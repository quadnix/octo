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

  it('should pass when terraform plan matches the octo diff', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail when terraform plans no change for an octo diff', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(result.errors[0].message).toContain('no change on any of [aws_vpc.vpc-1]');
  });

  it('should fail when terraform plans a change that maps to no octo diff', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
      { actions: ['delete'], address: 'aws_instance.rogue' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.message.includes('aws_instance.rogue'))).toBe(true);
  });

  it('should pass when an octo update matches an in-place terraform update', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateGraph({ changeVpc: true });

    testModes.writePlan('region-module', [
      { actions: ['update'], address: 'aws_vpc.vpc-1' },
      { actions: ['update'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail when terraform plans a different action than octo', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writePlan('region-module', [
      { actions: ['delete'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some(
        (e) => e.message.includes('has octo action "add"') && e.message.includes('[delete] on "aws_vpc.vpc-1"'),
      ),
    ).toBe(true);
  });

  it('should fail when terraform plans a change for a resource with no octo diff', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateGraph(); // identical graph → no octo diff, but vpc-1 stays in the mapping

    testModes.writePlan('region-module', [
      { actions: ['update'], address: 'aws_vpc.vpc-1' },
      { actions: ['no-op'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('has no octo diff') && e.message.includes('aws_vpc.vpc-1')),
    ).toBe(true);
  });

  it('should accept a delete in the same folder and warn for a delete with no supplied plan', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
    ]);

    const result = await runValidate(app, {
      persistedMappings: persisted,
      plans: testModes.plans,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
    // sg-1 lived in sg-module, whose plan was not supplied — its delete can only be warned about.
    expect(result.warnings.some((w) => w.message.includes('sg-1') && w.message.includes('sg-module'))).toBe(true);
  });

  it('should verify a delete against the emptied folder plan of a committed-then-deleted module', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    // sg-module was emptied by generate; its plan (supplied here) shows the destroy. The folder is
    // recognized from the committed folder record, so the delete is verified, not warned.
    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['delete'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: persisted,
      plans: testModes.plans,
      previousFolders: [{ hasExternalResources: false, moduleId: 'sg-module', providers: [] }],
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail when the emptied folder plan shows a non-delete for a deleted resource', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['update'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, {
      persistedMappings: persisted,
      plans: testModes.plans,
      previousFolders: [{ hasExternalResources: false, moduleId: 'sg-module', providers: [] }],
    });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some(
        (e) => e.message.includes('is deleted in octo') && e.message.includes('[update] on "aws_security_group.sg-1"'),
      ),
    ).toBe(true);
  });

  it('should warn and exclude a plan supplied for a folder octo does not track', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);
    // A folder octo never wrote: its changes must not surface as "maps to no octo diff" errors.
    testModes.writePlan('user-module', [{ actions: ['create'], address: 'aws_instance.hand-written' }]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('folder "user-module", which octo does not track'))).toBe(
      true,
    );
  });

  it('should fail when a deleted octo resource shows no change in terraform', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['no-op'], address: 'null_resource.igw-1' },
    ]);

    const result = await runValidate(app, {
      persistedMappings: persisted,
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some(
        (e) => e.message.includes('is deleted in octo') && e.message.includes('no change on "null_resource.igw-1"'),
      ),
    ).toBe(true);
  });

  it('should fail when a deleted octo resource shows a non-delete terraform action', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['update'], address: 'null_resource.igw-1' },
    ]);

    const result = await runValidate(app, {
      persistedMappings: persisted,
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some(
        (e) => e.message.includes('is deleted in octo') && e.message.includes('[update] on "null_resource.igw-1"'),
      ),
    ).toBe(true);
  });

  it('should not let a deleted octo resource claim a delete on a similarly-named address', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
      { actions: ['delete'], address: 'null_resource.igw-10' },
    ]);

    const result = await runValidate(app, {
      persistedMappings: persisted,
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.message.includes('null_resource.igw-10'))).toBe(true);
  });

  it('should warn but pass when a deleted resource has no persisted mapping', async () => {
    const { app } = await stageDeletedIgwAndSg();

    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
    ]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.message.includes('igw-1') && w.message.includes('persisted'))).toBe(true);
  });

  it('should pass an octo replace that terraform recreates', async () => {
    const { app } = await testModes.createReplaceableResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateReplaceableGraph();

    // octo: vpc-1 REPLACE. terraform: vpc-1 recreated (delete + create).
    testModes.writePlan('region-module', [
      { actions: ['create', 'delete'], address: 'aws_vpc.vpc-1' },
      { actions: ['update'], address: 'null_resource.igw-1' }, // depth-1 parent update
    ]);
    testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail an octo replace that terraform only updates in place', async () => {
    const { app } = await testModes.createReplaceableResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateReplaceableGraph();

    testModes.writePlan('region-module', [
      { actions: ['update'], address: 'aws_vpc.vpc-1' }, // octo said replace, tf only updates
      { actions: ['update'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('has octo action "replace"') && e.message.includes('aws_vpc.vpc-1')),
    ).toBe(true);
  });

  it('should attribute a terraform cascade on a referrer with no octo diff to the upstream replace', async () => {
    const { app } = await testModes.createReplaceableResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateReplaceableGraph();

    // sg-1 has no octo diff (its parent igw-1 only changed its own parent), but terraform recreates
    // it because it transitively references the replaced vpc-1 (force-new cascade). Design B: this is
    // expected, not an unattributed change.
    testModes.writePlan('region-module', [
      { actions: ['create', 'delete'], address: 'aws_vpc.vpc-1' },
      { actions: ['update'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create', 'delete'], address: 'aws_security_group.sg-1' }]);

    const result = await runValidate(app, { persistedMappings: noPersisted(), plans: testModes.plans });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail when a module plan is not provided', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);

    const result = await runValidate(app, {
      persistedMappings: noPersisted(),
      plans: testModes.plans,
    });
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.message.includes('No terraform plan provided'))).toBe(true);
  });
});
