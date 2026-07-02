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
    await testModes.generate(graph.app, { outputDir: testModes.outputDir });
    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
    await testModes.commit(graph.app, { outputs: testModes.outputs });
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

    it('should persist terraform addresses so a later validate can verify a delete', async () => {
      const { app } = await generateAndCommitFullGraph();

      // Re-create the desired graph without igw-1/sg-1 → octo deletes them. Only the committed
      // resource state (written by the commit above) carries their terraform addresses into this
      // validate.
      testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));
      await testModes.generate(app, { outputDir: testModes.outputDir });

      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);

      const result = await testModes.validate(app, { plans: testModes.plans });
      expect(result.errors).toEqual([]);
      expect(result.pass).toBe(true);
    });

    it('should persist resource state with each resource attributed to its module', async () => {
      await generateAndCommitFullGraph();

      const { resources } = await testModes.getResourceState();
      const vpc = Object.values(resources).find((r) => r.resource.resourceId === 'vpc-1')!;
      const sg = Object.values(resources).find((r) => r.resource.resourceId === 'sg-1')!;
      expect(vpc.moduleId).toBe('region-module');
      expect(sg.moduleId).toBe('sg-module');
    });

    it('should persist the terraform memory with the committed resource state', async () => {
      await generateAndCommitFullGraph();

      const { terraformFolders, terraformResources } = await testModes.getCommittedTerraformState();
      expect(terraformFolders).toEqual([
        { hasExternalResources: true, moduleId: 'region-module', providers: [] },
        { hasExternalResources: false, moduleId: 'sg-module', providers: [] },
      ]);
      expect(terraformResources).toEqual([
        {
          moduleId: 'region-module',
          resourceContext: expect.stringContaining('vpc-1'),
          resourceId: 'vpc-1',
          terraformAddresses: ['aws_vpc.vpc-1'],
        },
        {
          moduleId: 'region-module',
          resourceContext: expect.stringContaining('igw-1'),
          resourceId: 'igw-1',
          terraformAddresses: ['null_resource.igw-1'],
        },
        {
          moduleId: 'sg-module',
          resourceContext: expect.stringContaining('sg-1'),
          resourceId: 'sg-1',
          terraformAddresses: ['aws_security_group.sg-1'],
        },
      ]);
    });
  });

  describe('generate()', () => {
    it('should persist models.json with each model attributed to its module', async () => {
      const { app } = await testModes.createResourceGraph();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      const { models } = await testModes.getModelState();
      const appModel = Object.values(models).find((m) => m.className === '@octo/App')!;
      expect(appModel.moduleId).toBe('app-module');
    });

    it('should persist the folder record with exactly the folder-bearing modules', async () => {
      const { app } = await testModes.createResourceGraph();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      // Model-only modules (app-module) are absent: they bear no folder, so they never need emptying.
      const records = await testModes.getTerraformFolderRecords();
      expect(records).toEqual([
        { hasExternalResources: true, moduleId: 'region-module', providers: [] },
        { hasExternalResources: false, moduleId: 'sg-module', providers: [] },
      ]);
    });

    it('should record each folder provider block as rendered HCL', async () => {
      testModes.registerTerraformConfig({ providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } } });
      testModes.registerTerraformProvider('aws', '111111111', 'us-east-1');

      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '111111111',
        regionId: 'us-east-1',
      });
      await testModes.generate(app, { outputDir: testModes.outputDir });

      const records = await testModes.getTerraformFolderRecords();
      expect(records).toEqual([
        {
          hasExternalResources: false,
          moduleId: 'region-module',
          providers: [
            {
              accountId: '111111111',
              blockHcl: expect.stringContaining('provider "aws"'),
              providerType: 'aws',
              regionId: 'us-east-1',
              requiredProvider: { minVersion: '5.0.0', source: 'hashicorp/aws' },
            },
          ],
        },
      ]);
      // The rendered block is complete enough to re-emit verbatim in an emptied folder.
      expect(records[0].providers[0].blockHcl).toContain('alias = "_111111111-us-east-1"');
      expect(records[0].providers[0].blockHcl).toContain('region = "us-east-1"');
    });
  });

  describe('registerTerraformProvider() / registerTerraformConfig()', () => {
    it('should render the registered provider block and bind it on the resource', async () => {
      testModes.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      testModes.registerTerraformProvider('aws', '111111111', 'us-east-1');

      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '111111111',
        regionId: 'us-east-1',
      });
      await testModes.generate(app, { outputDir: testModes.outputDir });

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

      await expect(testModes.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(
        'No provider registered for account "999999999" and region "us-east-1"!',
      );
    });
  });

  describe('runAction()', () => {
    it('should delegate to the run-action mode through the Octo class', async () => {
      const { app } = await testModes.createResourceGraph();

      const result = await testModes.runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });

      expect(result.action).toBe('add');
      expect(result.resourceId).toBe('igw-1');
      expect(result.response).toEqual({ igwId: 'igw-0real' });
    });
  });
});
