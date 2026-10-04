import { readFile, rm } from 'node:fs/promises';
import { join } from 'path';
import type { UnknownResource } from './app.type.js';
import { Resource } from './decorators/resource.decorator.js';
import { Container } from './functions/container/container.js';
import type { App } from './models/app/app.model.js';
import { BaseResourceSchema } from './resources/resource.schema.js';
import { ATerraformResource } from './resources/terraform-resource.abstract.js';
import type { TerraformModuleScope } from './services/terraform/terraform.service.js';
import { TransactionService } from './services/transaction/transaction.service.js';
import { ExternalIgwResource, TestModes, TfVpcResource } from './utilities/test-helpers/test-modes.js';

/**
 * A terraform resource holding names its provider keeps unique within a region, rendered as a named
 * block and a block of its own beside it, the way a resource with a policy renders.
 */
class NamedTfResource extends ATerraformResource<BaseResourceSchema, NamedTfResource> {
  constructor(resourceId: string, properties: BaseResourceSchema['properties'], parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const namedTf = terraform.addOctoTerraformResource(this as NamedTfResource);
    namedTf.addTerraformResource('test_named', this.resourceId, { names: this.properties['names'] });
    namedTf.addTerraformResource('test_named_policy', `${this.resourceId}_policy`, {});
  }
}
Resource<NamedTfResource>('@octo', 'test-named-tf-resource', BaseResourceSchema, {
  uniqueProperties: [{ path: 'names[]', within: ['regionId'] }],
})(NamedTfResource);

/**
 * An external resource holding a name its provider keeps unique.
 */
class NamedExternalResource extends ExternalIgwResource {}
Resource<NamedExternalResource>('@octo', 'test-named-external-resource', BaseResourceSchema, {
  uniqueProperties: [{ path: 'names[]', within: ['regionId'] }],
})(NamedExternalResource);

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
    it('should throw error if the app is not locked', async () => {
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });

      await expect(
        testModes.commit(graph.app, { lockId: 'never-taken', outputs: testModes.outputs }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"App is not locked!"`);
    });

    it('should throw error if the lock ID is not the one held', async () => {
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      await testModes.stateManagementService.lockApp();

      await expect(
        testModes.commit(graph.app, { lockId: 'another-runs-lock', outputs: testModes.outputs }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid lock ID!"`);
    });

    it('should hold on to the lock it was given, leaving the release to its caller', async () => {
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      const { lockId } = await testModes.stateManagementService.lockApp();
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

      await testModes.simulateFreshProcess();
      await testModes['octo'].commit(graph.app, { lockId, outputs: testModes.outputs });

      expect(await testModes.stateManagementService.getAppLock()).toBe(lockId);
    });

    it('should record what applied and leave the rest uncommitted on a partial commit', async () => {
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      // Only one of the two folders applied, which is what a failed `run --all -- apply` leaves behind.
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });

      const { warnings } = await testModes.commit(graph.app, { outputs: testModes.outputs, partial: true });

      const committedResourceIds = testModes.resourceDataRepository
        .getActualResourcesByProperties()
        .map((r) => r.resourceId);
      expect(committedResourceIds).toContain('vpc-1');
      expect(committedResourceIds).not.toContain('sg-1');
      expect(warnings.map((w) => w.message).join('\n')).toContain('left uncommitted');
    });

    // An external resource's action records what it published, because octo state is the only place
    // a later plan can read it from. The committed graph takes that over once the commit lands.
    it('should keep the published record of an external resource a partial commit left out', async () => {
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      await testModes.stateManagementService.saveExternalResourceState('igw-1', {
        inputs: {},
        properties: {},
        response: { igwId: 'igw-0published' },
      });
      // The apply got as far as the vpc: neither the external resource nor its child reported an output.
      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });

      await testModes.commit(graph.app, { outputs: testModes.outputs, partial: true });

      await expect(testModes.stateManagementService.getResourceResponse('igw-1')).resolves.toEqual({
        igwId: 'igw-0published',
      });
    });

    it('should clear the published record of an external resource once it is committed', async () => {
      await testModes.stateManagementService.saveExternalResourceState('igw-1', {
        inputs: {},
        properties: {},
        response: { igwId: 'igw-0published' },
      });

      await generateAndCommitFullGraph();

      await expect(testModes.stateManagementService.getResourceResponse('igw-1')).resolves.toEqual({
        igwId: 'igw-0real',
      });
    });

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

      const report = await testModes.validate(app, { plans: testModes.plans });
      expect(report.failures).toEqual([]);
      expect(report.drift).toEqual([]);
      // Recovered from the committed mapping: without it igw-1's address is unknown to this boot, and
      // terraform's destroy of it would read as drift.
      expect(report.intentChanges.find((c) => c.resourceId === 'igw-1')!.terraformChanges).toEqual([
        { address: 'null_resource.igw-1', changedFields: [], tfActions: ['delete'] },
      ]);
    });

    it('should persist resource state with each resource attributed to its module', async () => {
      await generateAndCommitFullGraph();

      const { resources } = await testModes.getResourceState();
      const vpc = Object.values(resources).find((r) => r.resource.resourceId === 'vpc-1')!;
      const sg = Object.values(resources).find((r) => r.resource.resourceId === 'sg-1')!;
      expect(vpc.moduleId).toBe('region-module');
      expect(sg.moduleId).toBe('sg-module');
    });

    it('should drop a deleted module from the committed state on the destroy commit', async () => {
      const { app } = await generateAndCommitFullGraph();

      // Delete igw/sg from intent and regenerate (sg-module is emptied). The apply destroys them;
      // the destroy commit supplies outputs only for the remaining filled folder.
      testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));
      await testModes.generate(app, { outputDir: testModes.outputDir });

      testModes.outputs.clear();
      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      const { warnings } = await testModes.commit(app, { outputs: testModes.outputs });

      // Nothing was demanded or warned for the emptied sg-module; it dropped out of the committed
      // folder record and resource mappings.
      expect(warnings).toEqual([]);
      const { terraformFolders, terraformResources } = await testModes.getCommittedTerraformState();
      expect(terraformFolders).toEqual([{ hasExternalResources: false, moduleId: 'region-module', providers: [] }]);
      expect(terraformResources.map((r) => r.resourceId)).toEqual(['vpc-1']);
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

  describe('generate() — deletion', () => {
    // The emptied-folder shape: config block + provider block(s), zero resource blocks, empty
    // variables/outputs, remote_state-only terragrunt.hcl (so terragrunt still runs the destroy).
    async function expectEmptiedFolder(moduleId: string): Promise<string> {
      const moduleDir = join(testModes.outputDir, moduleId);

      const mainTf = await readFile(join(moduleDir, 'main.tf'), 'utf-8');
      expect(mainTf).toContain('terraform {');
      expect(mainTf).not.toContain('resource "');
      expect(mainTf).not.toContain('data "');

      expect(await readFile(join(moduleDir, 'variables.tf'), 'utf-8')).toBe('');
      expect(await readFile(join(moduleDir, 'outputs.tf'), 'utf-8')).toBe('');

      const terragruntHcl = await readFile(join(moduleDir, 'terragrunt.hcl'), 'utf-8');
      expect(terragruntHcl).toContain('remote_state {');
      expect(terragruntHcl).not.toContain('dependency "');
      expect(terragruntHcl).not.toContain('inputs =');

      return mainTf;
    }

    it('should empty the folder of a committed module deleted from intent', async () => {
      const { app } = await generateAndCommitFullGraph();

      // Re-stage only vpc-1: igw-1 (region-module) and sg-1 (sg-module) are deletions.
      testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));
      await testModes.generate(app, { outputDir: testModes.outputDir });

      // region-module is still in intent: rewritten filled, without the deleted igw.
      const regionMainTf = await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8');
      expect(regionMainTf).toContain('resource "aws_vpc" "vpc-1"');
      expect(regionMainTf).not.toContain('null_resource');

      // sg-module is not: emptied, and gone from the new folder record.
      await expectEmptiedFolder('sg-module');
      expect(await testModes.getTerraformFolderRecords()).toEqual([
        { hasExternalResources: false, moduleId: 'region-module', providers: [] },
      ]);
    });

    it('should re-empty a committed deleted folder on every generate until its destroy is committed', async () => {
      const { app } = await generateAndCommitFullGraph();
      testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));
      await testModes.generate(app, { outputDir: testModes.outputDir });

      // The first deleting generate dropped sg-module from models.json; only the committed
      // resources.json still remembers it. Remove the folder from disk to prove the second
      // generate re-writes it from that record alone.
      await rm(join(testModes.outputDir, 'sg-module'), { force: true, recursive: true });
      await testModes.generate(app, { outputDir: testModes.outputDir });

      await expectEmptiedFolder('sg-module');
    });

    it('should empty an uncommitted folder recorded by the previous generate', async () => {
      // A previous generate wrote legacy-module; nothing was ever committed.
      await testModes.seedModelTerraformFolders([
        { hasExternalResources: false, moduleId: 'legacy-module', providers: [] },
      ]);

      const { app } = await testModes.createResourceGraph();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      // The record was read before this generate overwrote models.json: legacy-module is emptied
      // and the new record lists only the filled folders.
      await expectEmptiedFolder('legacy-module');
      expect((await testModes.getTerraformFolderRecords()).map((r) => r.moduleId)).toEqual([
        'region-module',
        'sg-module',
      ]);
    });

    it('should empty all folders with recorded providers when module and provider are deleted together', async () => {
      testModes.registerTerraformConfig({ providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } } });
      testModes.registerTerraformProvider('aws', '111111111', 'us-east-1');
      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '111111111',
        regionId: 'us-east-1',
      });
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      await testModes.commit(app, { outputs: testModes.outputs });

      // Delete every resource-bearing module AND the provider/config from octo.yml in one edit.
      testModes.clearTerraformRegistrations();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      // The emptied folder renders the provider from the recorded block, not from octo.yml.
      const mainTf = await expectEmptiedFolder('region-module');
      expect(mainTf).toContain('provider "aws"');
      expect(mainTf).toContain('alias = "_111111111-us-east-1"');
      expect(mainTf).toContain('region = "us-east-1"');
      expect(mainTf).toContain('source = "hashicorp/aws"');
      expect(mainTf).toContain('version = ">= 5.0.0"');

      // Nothing was filled this run.
      expect(await testModes.getTerraformFolderRecords()).toEqual([]);
    });

    it('should regenerate identical files when intent is unchanged', async () => {
      const { app } = await testModes.createResourceGraph();
      await testModes.generate(app, { outputDir: testModes.outputDir });
      const firstRegionMainTf = await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8');
      const firstSgMainTf = await readFile(join(testModes.outputDir, 'sg-module', 'main.tf'), 'utf-8');

      // Both folders are preloaded from the first run's record, but the sweep refills them.
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8')).toBe(firstRegionMainTf);
      expect(await readFile(join(testModes.outputDir, 'sg-module', 'main.tf'), 'utf-8')).toBe(firstSgMainTf);
    });

    it('should throw when models.json is corrupt rather than silently losing memory', async () => {
      await testModes['stateManagementService'].saveStates([
        { data: Buffer.from('{ not json'), stateFileName: 'models.json' },
      ]);

      const { app } = await testModes.createResourceGraph();
      await expect(testModes.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow();
    });
  });

  describe("generate() — a resource taking a deleted resource's name", () => {
    async function commitResources(resources: [string, UnknownResource][]): Promise<App> {
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('app-module', { app: ['test-app'] });
      for (const [moduleId, resource] of resources) {
        await testModes.addResource(moduleId, resource);
        testModes.writeTfState(moduleId, {});
      }
      await testModes.generate(app as App, { outputDir: testModes.outputDir });
      await testModes.commit(app as App, { outputs: testModes.outputs });
      return app as App;
    }

    async function readMainTf(moduleId: string): Promise<string> {
      return readFile(join(testModes.outputDir, moduleId, 'main.tf'), 'utf-8');
    }

    it('should throw when the deleted resource is in another module folder', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);

      await testModes.addResource(
        'module-2',
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );

      await expect(testModes.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(
        'Resource "@octo/test-named-tf-resource=named-2" of module "module-2" takes a name of "@octo/test-named-tf-resource=named-1" of module "module-1", and terraform cannot move infrastructure between module folders!',
      );
    });

    it('should throw when one resource takes the names of two deleted resources', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
        ['module-1', new NamedTfResource('named-2', { names: ['orders'], regionId: 'us-east-1' })],
      ]);

      await testModes.addResource(
        'module-1',
        new NamedTfResource('named-3', { names: ['accounts', 'orders'], regionId: 'us-east-1' }),
      );

      await expect(testModes.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(
        'Resource "@octo/test-named-tf-resource=named-3" takes the names of both "@octo/test-named-tf-resource=named-1" and "@octo/test-named-tf-resource=named-2", and can take over only one of them!',
      );
    });

    it('should throw when two resources take the names of one deleted resource', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts', 'orders'], regionId: 'us-east-1' })],
      ]);

      await testModes.addResource(
        'module-1',
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.addResource(
        'module-1',
        new NamedTfResource('named-3', { names: ['orders'], regionId: 'us-east-1' }),
      );

      await expect(testModes.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(
        'Resources "@octo/test-named-tf-resource=named-2" and "@octo/test-named-tf-resource=named-3" both take a name of "@octo/test-named-tf-resource=named-1", and only one can take it over!',
      );
    });

    it('should move every block of the deleted resource to the resource taking its name', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);

      await testModes.addResource(
        'module-1',
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app, { outputDir: testModes.outputDir });

      const mainTf = await readMainTf('module-1');
      expect(mainTf).toContain('moved {\n  from = test_named.named-1\n  to = test_named.named-2\n}');
      expect(mainTf).toContain(
        'moved {\n  from = test_named_policy.named-1_policy\n  to = test_named_policy.named-2_policy\n}',
      );
    });

    it('should not move a deleted resource whose name is free in the domain of the added one', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);

      await testModes.addResource(
        'module-1',
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'eu-west-1' }),
      );
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await readMainTf('module-1')).not.toContain('moved {');
    });

    it('should not move a resource that keeps its id', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);

      testModes.resourceDataRepository.addNewResource(
        new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await readMainTf('module-1')).not.toContain('moved {');
    });

    it('should not move an external resource', async () => {
      const transactionService = await Container.getInstance().get(TransactionService);
      transactionService.registerResourceActions(NamedExternalResource, [
        { filter: (): boolean => true, handle: async (): Promise<BaseResourceSchema['response']> => ({}) },
      ]);
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('app-module', { app: ['test-app'] });
      await testModes.addResource(
        'module-1',
        new NamedExternalResource('named-1', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app as App, { outputDir: testModes.outputDir });
      testModes.writeTfState('module-1', { 'named-1': {} });
      await testModes.commit(app as App, { outputs: testModes.outputs });

      await testModes.addResource(
        'module-1',
        new NamedExternalResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app as App, { outputDir: testModes.outputDir });

      expect(await readMainTf('module-1')).not.toContain('moved {');
    });

    it('should stop moving once the move is committed', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);
      await testModes.addResource(
        'module-1',
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app, { outputDir: testModes.outputDir });
      await testModes.commit(app, { outputs: testModes.outputs });

      testModes.resourceDataRepository.addNewResource(
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await readMainTf('module-1')).toContain('resource "test_named" "named-2"');
      expect(await readMainTf('module-1')).not.toContain('moved {');
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
