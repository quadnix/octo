import { readFile } from 'node:fs/promises';
import { join } from 'path';
import { TestModes, TfVpcResource } from './utilities/test-helpers/test-modes.js';

describe('Main UT', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  async function generateAndCommitFullGraph(): Promise<ReturnType<TestModes['createResourceGraph']>> {
    const graph = await testModes.createResourceGraph();
    await testModes.octo.generate(graph.app, { outputDir: testModes.outputDir });
    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
    await testModes.octo.commit(graph.app, { outputs: testModes.outputs });
    return graph;
  }

  describe('commit()', () => {
    it('should persist state so responses land in actual/old and nothing is dirty', async () => {
      await generateAndCommitFullGraph();

      // State was saved then reloaded; responses came from tfstate.
      const vpc = testModes.resourceDataRepository
        .getActualResourcesByProperties()
        .find((r) => r.resourceId === 'vpc-1')!;
      const igw = testModes.resourceDataRepository
        .getActualResourcesByProperties()
        .find((r) => r.resourceId === 'igw-1')!;
      expect(vpc.response['VpcId']).toBe('vpc-0real');
      expect(igw.response['igwId']).toBe('igw-0real');

      // The old state equals the committed desired state; nothing is dirty.
      const oldVpc = testModes.resourceDataRepository['oldResources'].find((r) => r.resourceId === 'vpc-1')!;
      expect(oldVpc.response['VpcId']).toBe('vpc-0real');
      expect(testModes.resourceDataRepository['dirtyResources']).toEqual([]);
    });

    it('should persist the terraform mapping so a later validate can verify a delete', async () => {
      const { app } = await generateAndCommitFullGraph();

      // Re-create the desired graph without igw-1/sg-1 → octo deletes them. Only the persisted mapping
      // (written by the commit above) carries their terraform addresses into this validate.
      testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));
      await testModes.octo.generate(app, { outputDir: testModes.outputDir });

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);

      const result = await testModes.octo.validate(app, { plans: testModes.plans });
      expect(result.errors).toEqual([]);
      expect(result.pass).toBe(true);
    });
  });

  describe('registerTerraformProvider() / registerTerraformConfig()', () => {
    it('should render the registered provider block and bind it on the resource', async () => {
      testModes.octo.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      testModes.octo.registerTerraformProvider('aws', '111111111', 'us-east-1');

      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '111111111',
        regionId: 'us-east-1',
      });
      await testModes.octo.generate(app, { outputDir: testModes.outputDir });

      const mainTf = await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8');
      expect(mainTf).toContain('provider "aws"');
      expect(mainTf).toContain('alias = "_111111111-us-east-1"');
      expect(mainTf).toContain('region = "us-east-1"');
      // The resource is bound to the derived provider alias (no provider type named by the author).
      expect(mainTf).toContain('provider = aws._111111111-us-east-1');
    });

    it('should surface a clear error from generate when a resource binds an unregistered provider', async () => {
      // No provider registered → the toHCL sweep cannot derive one for vpc-1's account.
      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '999999999',
        regionId: 'us-east-1',
      });

      await expect(testModes.octo.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(
        'No provider registered for account "999999999" and region "us-east-1"!',
      );
    });
  });

  describe('runAction()', () => {
    it('should delegate to the run-action mode through the Octo class', async () => {
      const { app } = await testModes.createResourceGraph();

      const result = await testModes.octo.runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });

      expect(result.action).toBe('add');
      expect(result.resourceId).toBe('igw-1');
      expect(result.response).toEqual({ igwId: 'igw-0real' });
    });
  });
});
