import type { App } from '../models/app/app.model.js';
import { ExternalIgwResource, TestModes, TfSgResource, TfVpcResource } from '../utilities/test-helpers/test-modes.js';
import { commitResources } from '../utilities/test-helpers/test-resources.js';
import type { PersistedTerraformMapping } from './octo-mode.shared.js';
import { validate } from './validate.mode.js';

describe('validate()', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  const noPersisted = (): Map<string, PersistedTerraformMapping> => new Map();

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

  // Stages a committed full graph, then re-creates a desired graph of just vpc-1 so igw-1 and sg-1
  // are deletes. Returns the app handle plus the persisted mapping the last commit would have written.
  async function stageDeletedIgwAndSg(): Promise<{ app: App; persisted: Map<string, PersistedTerraformMapping> }> {
    const { app, igw, sg } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));

    const persisted = new Map<string, PersistedTerraformMapping>([
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

    await testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    await testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail when terraform plans no change for an octo diff', async () => {
    const { app } = await testModes.createResourceGraph();

    await testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    await testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.pass).toBe(false);
    expect(result.errors[0].message).toContain('terraform plans no change on "aws_vpc.vpc-1"');
  });

  it('should fail when terraform plans a change that maps to no octo diff', async () => {
    const { app } = await testModes.createResourceGraph();

    await testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
      { actions: ['delete'], address: 'aws_instance.rogue' },
    ]);
    await testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.message.includes('aws_instance.rogue'))).toBe(true);
  });

  it('should pass when an octo update matches an in-place terraform update', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateGraph({ changeVpc: true });

    await testModes.writePlan('region-module', [
      { actions: ['update'], address: 'aws_vpc.vpc-1' },
      { actions: ['update'], address: 'null_resource.igw-1' },
    ]);
    await testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('should fail when terraform plans a different action than octo', async () => {
    const { app } = await testModes.createResourceGraph();

    await testModes.writePlan('region-module', [
      { actions: ['delete'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    await testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
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

    await testModes.writePlan('region-module', [
      { actions: ['update'], address: 'aws_vpc.vpc-1' },
      { actions: ['no-op'], address: 'null_resource.igw-1' },
    ]);
    await testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.pass).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('has no octo diff') && e.message.includes('aws_vpc.vpc-1')),
    ).toBe(true);
  });

  it('should accept a delete in the same folder and warn for a delete in a removed folder', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    await testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
    ]);

    const result = await validate(app, {
      persistedMappings: persisted,
      tfDir: testModes.outputDir,
    });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
    // sg-1 lived in sg-module, which is gone this boot — its delete can only be warned about.
    expect(result.warnings.some((w) => w.message.includes('sg-1') && w.message.includes('sg-module'))).toBe(true);
  });

  it('should fail when a deleted octo resource shows no change in terraform', async () => {
    const { app, persisted } = await stageDeletedIgwAndSg();

    await testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['no-op'], address: 'null_resource.igw-1' },
    ]);

    const result = await validate(app, {
      persistedMappings: persisted,
      tfDir: testModes.outputDir,
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

    await testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['update'], address: 'null_resource.igw-1' },
    ]);

    const result = await validate(app, {
      persistedMappings: persisted,
      tfDir: testModes.outputDir,
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

    await testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
      { actions: ['delete'], address: 'null_resource.igw-10' },
    ]);

    const result = await validate(app, {
      persistedMappings: persisted,
      tfDir: testModes.outputDir,
    });
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.message.includes('null_resource.igw-10'))).toBe(true);
  });

  it('should warn but pass when a deleted resource has no persisted mapping', async () => {
    const { app } = await stageDeletedIgwAndSg();

    await testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['delete'], address: 'null_resource.igw-1' },
    ]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.message.includes('igw-1') && w.message.includes('persisted'))).toBe(true);
  });

  it('should fail when a module plan file is missing', async () => {
    const { app } = await testModes.createResourceGraph();

    await testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);

    const result = await validate(app, {
      persistedMappings: noPersisted(),
      tfDir: testModes.outputDir,
    });
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Cannot read terraform plan'))).toBe(true);
  });
});
