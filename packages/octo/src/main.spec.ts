import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { jest } from '@jest/globals';
import { type UnknownResource, stub } from './app.type.js';
import { Resource } from './decorators/resource.decorator.js';
import { Container } from './functions/container/container.js';
import { Schema } from './functions/schema/schema.js';
import { Account } from './models/account/account.model.js';
import { AccountType } from './models/account/account.schema.js';
import { App } from './models/app/app.model.js';
import { AModule } from './modules/module.abstract.js';
import { BaseResourceSchema } from './resources/resource.schema.js';
import { ATerraformResource } from './resources/terraform-resource.abstract.js';
import { InputService } from './services/input/input.service.js';
import { LocalStateProvider } from './services/state-management/local.state-provider.js';
import { StateManagementService } from './services/state-management/state-management.service.js';
import type { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TestStateProvider } from './services/state-management/test.state-provider.js';
import type { TerraformModuleScope } from './services/terraform/terraform.service.js';
import { TransactionService } from './services/transaction/transaction.service.js';
import { TestAnchor, TestResourceAction } from './utilities/test-helpers/test-classes.js';
import { ExternalIgwResource, TestModes, TfSgResource, TfVpcResource } from './utilities/test-helpers/test-modes.js';

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

/**
 * An app module a child app declares.
 */
class ImportedAppModuleSchema {
  name = Schema<string>();
}
class ImportedAppModule extends AModule<ImportedAppModuleSchema, App> {
  static override readonly MODULE_PACKAGE = '@octo';
  static override readonly MODULE_SCHEMA = ImportedAppModuleSchema;

  async onInit(inputs: ImportedAppModuleSchema): Promise<App> {
    return new App(inputs.name);
  }
}

/**
 * An account module a store declares, taking its app by reference.
 */
class ImportedAccountModuleSchema {
  accountId = Schema<string>();
  app = Schema<App>();
}
class ImportedAccountModule extends AModule<ImportedAccountModuleSchema, Account> {
  static override readonly MODULE_PACKAGE = '@octo';
  static override readonly MODULE_SCHEMA = ImportedAccountModuleSchema;

  async onInit(inputs: ImportedAccountModuleSchema): Promise<Account> {
    const account = new Account(AccountType.AWS, inputs.accountId);
    inputs.app.addAccount(account);
    return account;
  }
}

describe('Main UT', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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

  /**
   * Boots the next command of an app on its state, with the classes of every state it reads loaded.
   */
  async function bootChild(childStateProvider: TestStateProvider): Promise<void> {
    await testModes.teardown();
    testModes = await TestModes.create({ stateProvider: childStateProvider });
    testModes['octo']['modelSerializationService'].registerClass('@octo/App', App);
    testModes['octo']['modelSerializationService'].registerClass('@octo/TestAnchor', TestAnchor);
  }

  /**
   * Copies the sealed files of the current app's state into another provider.
   */
  async function copyState(stateProvider: TestStateProvider): Promise<TestStateProvider> {
    await stateProvider.saveStates(
      await Promise.all(
        ['models.json', 'resources-actual.json'].map(async (stateFileName) => ({
          data: await testModes.stateManagementService.getState(stateFileName),
          stateFileName,
        })),
      ),
    );
    return stateProvider;
  }

  /**
   * Commits the standard graph as app P, then app S extending P with one resource on P's internet
   * gateway, and boots a fresh app. Returns both sealed states.
   */
  async function commitDiamondStates(): Promise<{ p: TestStateProvider; s: TestStateProvider }> {
    await generateAndCommitFullGraph();
    const p = await copyState(new TestStateProvider());

    await bootChild(new TestStateProvider());
    await testModes['octo'].extendState(p);
    const igw = testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1')!;
    await testModes.addResource('s-module', new TfSgResource('sg-s', {}, [igw]));
    const app = testModes['octo'].getRootModel();
    await testModes.generate(app, { outputDir: testModes.outputDir });
    testModes.writeTfState('s-module', { 'sg-s-SgId': 'sg-0s' });
    await testModes.commit(app, { outputs: testModes.outputs });
    const s = await copyState(new TestStateProvider());

    await bootChild(new TestStateProvider());
    return { p, s };
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

    it('should keep a resource at its last committed state when a partial commit cannot confirm it', async () => {
      const stateProvider = new TestStateProvider();
      await bootChild(stateProvider);
      await generateAndCommitFullGraph();
      await bootChild(stateProvider);
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      // The vpc's output is gone, but the internet gateway standing on it applied.
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' } });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

      await testModes.commit(graph.app, { outputs: testModes.outputs, partial: true });

      await expect(testModes.stateManagementService.getResourceResponse('vpc-1')).resolves.toEqual({
        VpcId: 'vpc-0real',
      });
      await expect(testModes.generate(graph.app, { outputDir: testModes.outputDir })).resolves.toBeDefined();
    });

    it('should keep every resource of a folder that never applied at its last committed state', async () => {
      const stateProvider = new TestStateProvider();
      await bootChild(stateProvider);
      await generateAndCommitFullGraph();
      await bootChild(stateProvider);
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });

      await testModes.commit(graph.app, { outputs: testModes.outputs, partial: true });

      await expect(testModes.stateManagementService.getResourceResponse('sg-1')).resolves.toEqual({
        SgId: 'sg-0real',
      });
    });

    it('should hold back a resource standing on one a partial commit left out', async () => {
      const graph = await testModes.createResourceGraph();
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' } });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

      const { warnings } = await testModes.commit(graph.app, { outputs: testModes.outputs, partial: true });

      const { data } = await testModes.stateManagementService.getResourceState('resources-actual.json');
      expect(Object.keys(data.resources)).toEqual([]);
      expect(warnings.map((w) => w.message)).toContain(
        'Partial commit: 2 resource(s) left uncommitted because a resource they stand on is: ' +
          '@octo/external-igw=igw-1, @octo/tf-sg=sg-1. Each keeps its last committed state, if it had one, and ' +
          'the next run plans it again.',
      );
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
          external: true,
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

    it('should keep the committed provider when an unapplied generate recorded another one', async () => {
      testModes.registerTerraformConfig({ providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } } });
      testModes.registerTerraformProvider('aws', '111111111', 'us-east-1');
      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '111111111',
        regionId: 'us-east-1',
      });
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      await testModes.commit(app, { outputs: testModes.outputs });

      // A generate moved the folder to another account and was never applied, so terraform state
      // still holds the vpc under the committed account's provider.
      await testModes.seedModelTerraformFolders([
        {
          hasExternalResources: false,
          moduleId: 'region-module',
          providers: [
            {
              accountId: '222222222',
              blockHcl: 'provider "aws" {\n  alias = "_222222222-us-east-1"\n}',
              providerType: 'aws',
              regionId: 'us-east-1',
              requiredProvider: { source: 'hashicorp/aws' },
            },
          ],
        },
      ]);

      testModes.clearTerraformRegistrations();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      const mainTf = await expectEmptiedFolder('region-module');
      expect(mainTf).toContain('alias = "_111111111-us-east-1"');
      expect(mainTf).toContain('alias = "_222222222-us-east-1"');
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

    it('should record a move when the deleted resource is in another module folder', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);

      await testModes.addResource(
        'module-2',
        new NamedTfResource('named-2', { names: ['accounts'], regionId: 'us-east-1' }),
      );
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await readMainTf('module-2')).not.toContain('moved {');
      expect((await testModes.getTerraformFolderRecords()).find((r) => r.moduleId === 'module-2')!.moves).toEqual([
        {
          addresses: [
            { from: 'test_named.named-1', to: 'test_named.named-2' },
            { from: 'test_named_policy.named-1_policy', to: 'test_named_policy.named-2_policy' },
          ],
          fromModuleId: 'module-1',
          outputs: [],
          resourceId: 'named-2',
        },
      ]);
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
        new TestResourceAction(async (): Promise<BaseResourceSchema['response']> => ({})),
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

  describe('generate() — a resource changing module folder', () => {
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

    async function moveResource(fromModuleId: string, toModuleId: string, resource: UnknownResource): Promise<void> {
      const inputService = await Container.getInstance().get(InputService);
      delete inputService['resources'][`${fromModuleId}.resource.${resource.localResourceId}`];
      inputService.registerResource(toModuleId, resource);
    }

    async function getMoves(): Promise<{ [moduleId: string]: unknown }> {
      const records = await testModes.getTerraformFolderRecords();
      return Object.fromEntries(records.filter((r) => r.moves).map((r) => [r.moduleId, r.moves]));
    }

    it('should record a move for a resource that keeps its id in another module folder', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);

      const named1 = new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' });
      testModes.resourceDataRepository.addNewResource(named1);
      await moveResource('module-1', 'module-2', named1);
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await getMoves()).toEqual({
        'module-2': [
          {
            addresses: [
              { from: 'test_named.named-1', to: 'test_named.named-1' },
              { from: 'test_named_policy.named-1_policy', to: 'test_named_policy.named-1_policy' },
            ],
            fromModuleId: 'module-1',
            outputs: [],
            resourceId: 'named-1',
          },
        ],
      });
    });

    it('should record a move each way when two module folders swap resources', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
        ['module-2', new NamedTfResource('named-2', { names: ['orders'], regionId: 'us-east-1' })],
      ]);

      const named1 = new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' });
      const named2 = new NamedTfResource('named-2', { names: ['orders'], regionId: 'us-east-1' });
      testModes.resourceDataRepository.addNewResource(named1);
      testModes.resourceDataRepository.addNewResource(named2);
      await moveResource('module-1', 'module-2', named1);
      await moveResource('module-2', 'module-1', named2);
      await testModes.generate(app, { outputDir: testModes.outputDir });

      const moves = await getMoves();
      expect(moves['module-1']).toEqual([expect.objectContaining({ fromModuleId: 'module-2', resourceId: 'named-2' })]);
      expect(moves['module-2']).toEqual([expect.objectContaining({ fromModuleId: 'module-1', resourceId: 'named-1' })]);
    });

    it('should record no move once the resource is back in its committed folder', async () => {
      const app = await commitResources([
        ['module-1', new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' })],
      ]);
      const named1 = new NamedTfResource('named-1', { names: ['accounts'], regionId: 'us-east-1' });
      testModes.resourceDataRepository.addNewResource(named1);
      await moveResource('module-1', 'module-2', named1);
      await testModes.generate(app, { outputDir: testModes.outputDir });

      await moveResource('module-2', 'module-1', named1);
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(await getMoves()).toEqual({});
    });
  });

  describe('extendState()', () => {
    let parentStateDirectoryPath: string;

    beforeEach(async () => {
      parentStateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-parent-state-'));
    });

    afterEach(async () => {
      await rm(parentStateDirectoryPath, { force: true, recursive: true });
    });

    async function commitParentState({
      loadClasses = true,
      stateProvider = new TestStateProvider(),
    }: { loadClasses?: boolean; stateProvider?: IStateProvider } = {}): Promise<IStateProvider> {
      await generateAndCommitFullGraph();
      await stateProvider.saveStates(
        await Promise.all(
          ['models.json', 'resources-actual.json'].map(async (stateFileName) => ({
            data: await testModes.stateManagementService.getState(stateFileName),
            stateFileName,
          })),
        ),
      );

      await testModes.teardown();
      testModes = await TestModes.create();
      if (!loadClasses) {
        return stateProvider;
      }
      // The classes a child app loads through its own imports.
      testModes['octo']['modelSerializationService'].registerClass('@octo/App', App);
      for (const resourceClass of [ExternalIgwResource, TfSgResource, TfVpcResource]) {
        testModes['octo']['resourceSerializationService'].registerClass(`@octo/${resourceClass.name}`, resourceClass);
      }
      return stateProvider;
    }

    it('should throw error when the state has sealed nothing yet', async () => {
      await generateAndCommitFullGraph();
      const stateProvider = new LocalStateProvider(parentStateDirectoryPath);
      await stateProvider.saveStates([
        { data: await testModes.stateManagementService.getState('models.json'), stateFileName: 'models.json' },
      ]);
      await testModes.teardown();
      testModes = await TestModes.create();

      await expect(testModes['octo'].extendState(stateProvider)).rejects.toThrow(
        'Cannot extend a state that has sealed no models!',
      );
    });

    it('should throw error when a module takes a node of a class this app does not import', async () => {
      const parentStateProvider = await commitParentState({ loadClasses: false });
      await testModes['octo'].extendState(parentStateProvider);

      expect(() => testModes['octo']['inputService'].resolve('app-module.model.app')).toThrow(
        '"app-module.model.app" is a "@octo/App", which this app does not import!',
      );
    });

    it('should throw error when a module is loaded already', async () => {
      testModes['octo']['moduleContainer'].register(ImportedAppModule, { packageName: '@octo' });
      testModes['octo'].loadModule(ImportedAppModule, 'child-app-module', { name: 'child' });

      await expect(testModes['octo'].extendState(new TestStateProvider())).rejects.toThrow(
        'Cannot extend a state after loading a module!',
      );
    });

    it('should throw error when this app declares a module the imported state declares', async () => {
      const parentStateProvider = await commitParentState();
      await testModes['octo'].extendState(parentStateProvider);

      expect(() => testModes['octo'].loadModule(ImportedAppModule, 'app-module', { name: 'child' })).toThrow(
        'Module id "app-module" is already in use!',
      );
    });

    it('should throw error when this app changes an imported resource', async () => {
      const parentStateProvider = await commitParentState();
      await testModes['octo'].extendState(parentStateProvider);
      const igw = testModes.resourceDataRepository.getNewResourcesByProperties().find((r) => r.resourceId === 'igw-1')!;
      igw.properties['igwName'] = 'changed-by-child';

      await expect(
        testModes.generate(testModes['octo'].getRootModel(), { outputDir: testModes.outputDir }),
      ).rejects.toThrow(
        'Resource "@octo/external-igw=igw-1" belongs to module "region-module" of an extended state; change it in that app!',
      );
    });

    it('should replace what this app committed of the imported resources with the imported state', async () => {
      const parentStateProvider = await commitParentState();
      const { data: parentResources } = await new StateManagementService(parentStateProvider).getResourceState(
        'resources-actual.json',
        { freeze: false },
      );
      const igwContext = Object.keys(parentResources.resources).find((c) => c.endsWith('=igw-1'))!;

      // This app committed the imported internet gateway with an older response, and one the other app has since deleted.
      const committed = JSON.parse(JSON.stringify(parentResources));
      committed.resources[igwContext].resource.response = { igwId: 'igw-0old' };
      committed.resources[igwContext.replace('igw-1', 'igw-2')] = {
        ...committed.resources[igwContext],
        resource: { ...committed.resources[igwContext].resource, parents: [], resourceId: 'igw-2' },
      };
      for (const stateFileName of ['resources-actual.json', 'resources-old.json']) {
        await testModes.stateManagementService.saveResourceState(stateFileName, committed, {});
      }
      await testModes['octo']['importReaderService'].retrieveResourceState();

      await testModes['octo'].extendState(parentStateProvider);

      expect(await testModes.resourceDataRepository.diff()).toEqual([]);
      expect(await testModes.resourceDataRepository.diffDirty()).toEqual([]);
      expect(testModes.resourceDataRepository.getNewResourceByContext(igwContext)!.response).toEqual({
        igwId: 'igw-0real',
      });
    });

    it('should leave the records of imported external resources to the app that wrote them', async () => {
      const parentStateProvider = await commitParentState();
      await testModes['octo'].extendState(parentStateProvider);
      const igw = testModes.resourceDataRepository.getNewResourcesByProperties().find((r) => r.resourceId === 'igw-1')!;
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [igw]));
      const app = testModes['octo'].getRootModel();
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('child-module', { 'sg-child-SgId': 'sg-0child' });
      const deleteExternalResourceState = jest.spyOn(testModes.stateManagementService, 'deleteExternalResourceState');

      await testModes.commit(app, { outputs: testModes.outputs });

      expect(deleteExternalResourceState).not.toHaveBeenCalled();
    });

    it('should read the imported state as it was sealed, not as a run under way left it', async () => {
      const parentStateProvider = await commitParentState({
        stateProvider: new LocalStateProvider(parentStateDirectoryPath),
      });
      const { lockId } = await parentStateProvider.lockApp({ commitId: `${Date.now()}-parent` });
      await parentStateProvider.unlockApp(lockId);
      await parentStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify({ data: { models: {} }, userData: {} })), stateFileName: 'models.json' },
      ]);

      await testModes['octo'].extendState(parentStateProvider);

      expect(testModes.resourceDataRepository.getNewResourcesByProperties().map((r) => r.resourceId)).toContain(
        'igw-1',
      );
    });

    it('should read the models and the resources from one sealed state', async () => {
      const parentStateProvider = await commitParentState();
      const getSealedStates = jest.spyOn(parentStateProvider, 'getSealedStates');

      await testModes['octo'].extendState(parentStateProvider);

      expect(getSealedStates).toHaveBeenCalledTimes(1);
      expect(getSealedStates).toHaveBeenCalledWith(['models.json', 'resources-actual.json']);
    });

    it('should declare once what two extended states share', async () => {
      const { p, s } = await commitDiamondStates();

      await testModes['octo'].extendState(p);
      await testModes['octo'].extendState(s);

      const sg = testModes.resourceDataRepository.getNewResourceByContext('@octo/tf-sg=sg-s')!;
      const igw = testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1')!;
      expect(sg.parents).toEqual([igw]);
      expect(testModes['octo'].getRootModel().name).toBe('test-app');
    });

    it('should plan to delete a resource of this app standing on one the extended state deleted', async () => {
      const childStateProvider = new TestStateProvider();
      const parentStateProvider = await commitParentState();
      await bootChild(childStateProvider);
      await testModes['octo'].extendState(parentStateProvider);
      const igw = testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1')!;
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [igw]));
      const app = testModes['octo'].getRootModel();
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('child-module', { 'sg-child-SgId': 'sg-0child' });
      await testModes.commit(app, { outputs: testModes.outputs });
      const parentState = JSON.parse((await parentStateProvider.getState('resources-actual.json')).toString());
      delete parentState.data.resources['@octo/external-igw=igw-1'];
      parentState.data.resources['@octo/tf-sg=sg-1'].resource.parents = [];
      await parentStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify(parentState)), stateFileName: 'resources-actual.json' },
      ]);
      await bootChild(childStateProvider);

      await testModes['octo'].extendState(parentStateProvider);
      const diffs = await testModes.resourceDataRepository.diff();

      expect(diffs.map((d) => [d.action, d.field, d.node.getContext()])).toContainEqual([
        'delete',
        'resourceId',
        '@octo/tf-sg=sg-child',
      ]);
    });

    it('should build on the imported graph, rendering only what this app declares', async () => {
      const parentStateProvider = await commitParentState();
      await testModes['octo'].extendState(parentStateProvider);
      const igw = testModes.resourceDataRepository.getNewResourcesByProperties().find((r) => r.resourceId === 'igw-1')!;
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [igw]));

      const app = testModes['octo'].getRootModel();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      expect(app.name).toBe('test-app');
      expect(testModes['terraformService'].getModuleIds()).toEqual(['child-module']);
      expect(await readFile(join(testModes.outputDir, 'child-module', 'main.tf'), 'utf-8')).toContain(
        'igw_id = "igw-0real"',
      );
      expect(Object.values((await testModes.getModelState()).models).map((m) => m.moduleId)).toEqual(['app-module']);
    });
  });

  describe('loadModule()', () => {
    it('should throw error when the module id holds ":"', () => {
      expect(() => testModes['octo'].loadModule(ImportedAppModule, 'commons:app-module', { name: 'child' })).toThrow(
        'Module id "commons:app-module" may not hold ":", which names a store!',
      );
    });
  });

  describe('readImportsAsGenerated()', () => {
    it("should read each store as this run's generate read it", async () => {
      const childStateProvider = new TestStateProvider();
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(childStateProvider);
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      await testModes.generate(app as App, { outputDir: testModes.outputDir });
      const storeState = JSON.parse((await storeStateProvider.getState('resources-actual.json')).toString());
      storeState.data.resources['@octo/external-igw=igw-1'].resource.response.igwId = 'igw-0changed';
      await storeStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify(storeState)), stateFileName: 'resources-actual.json' },
      ]);
      await bootChild(childStateProvider);

      await testModes['octo'].readImportsAsGenerated();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);

      const igw = testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1')!;
      expect(igw.response).toEqual({ igwId: 'igw-0real' });
    });

    it('should read a store generate did not read as sealed', async () => {
      const childStateProvider = new TestStateProvider();
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(childStateProvider);

      await testModes['octo'].readImportsAsGenerated();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);

      expect(testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1')).toBeDefined();
    });
  });

  describe('readStores()', () => {
    /**
     * Commits the standard graph, its app holding an anchor, as a store's sealed state, then boots a
     * fresh app on a state of its own that has loaded the store's classes.
     */
    async function commitStoreState(childStateProvider = new TestStateProvider()): Promise<TestStateProvider> {
      const graph = await testModes.createResourceGraph();
      graph.app.addAnchor(new TestAnchor('store-anchor', {}, graph.app));
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
      await testModes.commit(graph.app, { outputs: testModes.outputs });
      const storeStateProvider = await copyState(new TestStateProvider());

      await bootChild(childStateProvider);
      return storeStateProvider;
    }

    async function declareChildApp(): Promise<App> {
      await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      return testModes['octo'].getRootModel();
    }

    function getStoreResource(resourceId: string): UnknownResource {
      return testModes.resourceDataRepository.getNewResourcesByProperties().find((r) => r.resourceId === resourceId)!;
    }

    /**
     * Commits this app with one resource standing on the store's internet gateway, and boots its next command.
     */
    async function commitChildOnStore(
      childStateProvider: TestStateProvider,
      storeStateProvider: TestStateProvider,
    ): Promise<void> {
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const app = await declareChildApp();
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [getStoreResource('igw-1')]));
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('child-module', { 'sg-child-SgId': 'sg-0child' });
      await testModes.commit(app, { outputs: testModes.outputs });
      await bootChild(childStateProvider);
    }

    it('should throw error when a store name holds more than letters, digits, "_" and "-"', async () => {
      await expect(
        testModes['octo'].readStores([{ name: 'com.mons', stateProvider: new TestStateProvider() }]),
      ).rejects.toThrow('Store name "com.mons" may hold only letters, digits, "_" and "-"!');
    });

    it('should throw error when a store was generated on another version of a package this app uses', async () => {
      testModes['octo'].registerPackageVersions({ '@quadnix/octo': '1.0.0', '@quadnix/store-only': '1.0.0' });
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());
      testModes['octo'].registerPackageVersions({ '@quadnix/octo': '1.0.1' });

      await expect(
        testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]),
      ).rejects.toThrow(
        'Store "commons" was generated on "@quadnix/octo" 1.0.0, this app runs 1.0.1; generate it again on 1.0.1!',
      );
    });

    it('should throw error when a store was written in another state version', async () => {
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      const modelState = JSON.parse((await storeStateProvider.getState('models.json')).toString());
      modelState.userData.version = 2;
      await storeStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify(modelState)), stateFileName: 'models.json' },
      ]);
      await bootChild(new TestStateProvider());

      await expect(
        testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]),
      ).rejects.toThrow('Store "commons" is state version 2, this octo reads 1!');
    });

    it('should throw error when a store is read twice', async () => {
      const storeStateProvider = await commitStoreState();

      await expect(
        testModes['octo'].readStores([
          { name: 'commons', stateProvider: storeStateProvider },
          { name: 'commons', stateProvider: storeStateProvider },
        ]),
      ).rejects.toThrow('Store "commons" is read twice!');
    });

    it("should throw error when this app's state links to a store's resource it holds no copy of", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      for (const stateFileName of ['resources-actual.json', 'resources-old.json']) {
        const childState = JSON.parse((await childStateProvider.getState(stateFileName)).toString());
        delete childState.data.copiedResources;
        await childStateProvider.saveStates([{ data: Buffer.from(JSON.stringify(childState)), stateFileName }]);
      }

      await expect(testModes['octo']['importReaderService'].retrieveResourceState()).rejects.toThrow(
        'Resource "@octo/tf-sg=sg-child" links to "@octo/external-igw=igw-1", which no state read holds!',
      );
    });

    it('should throw error when a store has sealed no models', async () => {
      await expect(
        testModes['octo'].readStores([{ name: 'commons', stateProvider: new TestStateProvider() }]),
      ).rejects.toThrow('Store "commons" has sealed no models!');
    });

    it('should throw error when a store holds nothing that is not already read', async () => {
      const storeStateProvider = await commitStoreState();

      await expect(
        testModes['octo'].readStores([
          { name: 'commons', stateProvider: storeStateProvider },
          { name: 'copy', stateProvider: storeStateProvider },
        ]),
      ).rejects.toThrow('Store "copy" holds nothing that is not already read!');
    });

    it('should throw error when this app is named after a store', async () => {
      const storeStateProvider = await commitStoreState();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      testModes['octo']['moduleContainer'].register(ImportedAppModule, { packageName: '@octo' });
      testModes['octo'].loadModule(ImportedAppModule, 'child-app-module', { name: 'test-app' });

      await expect(testModes['octo'].compose()).rejects.toThrow(
        'Model "app=test-app" of module "child-app-module" is already declared by module "commons:app-module"!',
      );
    });

    it('should throw error when this app adds a child to a node of a store', async () => {
      const storeStateProvider = await commitStoreState();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const storeApp = testModes['octo']['inputService'].resolve('commons:app-module.model.app') as App;

      expect(() => storeApp.addAccount(new Account(AccountType.AWS, '123456789012'))).toThrow(
        'Cannot add to read-only node "app=test-app"!',
      );
    });

    it("should throw error when this app changes a store's resource", async () => {
      const storeStateProvider = await commitStoreState();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const app = await declareChildApp();
      getStoreResource('igw-1').properties['igwName'] = 'changed-by-child';

      await expect(testModes.generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(
        'Resource "@octo/external-igw=igw-1" belongs to module "commons:region-module" of a store; change it in that app!',
      );
    });

    it("should throw error when a module takes a store's node of a class this app does not import", async () => {
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      await testModes.teardown();
      testModes = await TestModes.create();

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);

      expect(() => testModes['octo']['inputService'].resolve('commons:app-module.model.app')).toThrow(
        '"commons:app-module.model.app" is a "@octo/App", which this app does not import!',
      );
    });

    it("should declare a store's nodes under its name, and keep this app's own app as the root", async () => {
      const storeStateProvider = await commitStoreState();

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const app = await declareChildApp();

      const storeApp = testModes['octo']['inputService'].resolve('commons:app-module.model.app') as App;
      expect(storeApp.name).toBe('test-app');
      expect(Object.isFrozen(storeApp)).toBe(true);
      expect(app.name).toBe('child-app');
    });

    it("should save none of a store's nodes, but this app's overlays' anchors and links on them", async () => {
      const storeStateProvider = await commitStoreState();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const app = await declareChildApp();
      const childAnchor = new TestAnchor('child-anchor', {}, app);
      app.addAnchor(childAnchor);
      const storeApp = testModes['octo']['inputService'].resolve('commons:app-module.model.app') as App;
      const storeDependencyCount = storeApp.getDependencies().length;

      await testModes['testModuleContainer'].createTestOverlays('child-overlay-module', [
        { anchors: [childAnchor, storeApp.getAnchor('store-anchor')!], context: '@octo/test-overlay=overlay-1' },
      ]);
      await testModes.generate(app, { outputDir: testModes.outputDir });

      const modelState = await testModes.getModelState();
      expect(Object.keys(modelState.models)).toEqual(['app=child-app']);
      expect(modelState.anchors.map((a) => a.anchorId)).toEqual(['child-anchor']);
      expect(modelState.overlays.map((o) => o.overlay.anchors.map((a) => a.parent.context))).toEqual([
        ['app=child-app', 'app=test-app'],
      ]);
      expect(
        modelState.dependencies.filter((d) => d.to === 'app=test-app').map((d) => [d.from, d.relationship]),
      ).toEqual([['@octo/test-overlay=overlay-1', undefined]]);
      expect(modelState.dependencies.some((d) => d.from === 'app=test-app')).toBe(false);
      expect(Object.keys(modelState.modules)).not.toContain('commons:app-module');
      expect(storeApp.getDependencies()).toHaveLength(storeDependencyCount);
    });

    it("should build on a store's resources, saving this app's links to them and a copy of each, never as its own", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const app = await declareChildApp();
      const igw = getStoreResource('igw-1');
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [igw]));

      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('child-module', { 'sg-child-SgId': 'sg-0child' });
      await testModes.commit(app, { outputs: testModes.outputs });

      expect(testModes['terraformService'].getModuleIds()).toEqual(['child-module']);
      expect(await readFile(join(testModes.outputDir, 'child-module', 'main.tf'), 'utf-8')).toContain(
        'igw_id = "igw-0real"',
      );
      for (const stateFileName of ['resources-actual.json', 'resources-old.json']) {
        const { copiedResources, resources } = await testModes.getResourceState(stateFileName);
        expect(Object.keys(resources)).toEqual(['@octo/tf-sg=sg-child']);
        expect(resources['@octo/tf-sg=sg-child'].resource.parents.map((p) => p.context)).toEqual([igw.getContext()]);
        expect(Object.keys(copiedResources!)).toEqual(['@octo/external-igw=igw-1', '@octo/tf-vpc=vpc-1']);
        expect(copiedResources!['@octo/external-igw=igw-1'].moduleId).toBe('commons:region-module');
      }
    });

    it("should rebuild this app's resources on its copies of a store's, before the store is read", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);

      const actual = testModes.resourceDataRepository.getActualResourceByContext('@octo/tf-sg=sg-child')!;
      expect(Object.keys(actual.getParents())).toEqual(['external-igw']);
      expect(testModes.resourceDataRepository.getActualResourceByContext('@octo/external-igw=igw-1')).toBeUndefined();
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [getStoreResource('igw-1')]));

      expect(await testModes.resourceDataRepository.diff()).toEqual([]);
    });

    it('should plan to delete a resource of this app standing on a store this app no longer reads', async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);

      const diffs = await testModes.resourceDataRepository.diff();

      expect(diffs.map((d) => [d.action, d.field, d.node.getContext()])).toEqual([
        ['delete', 'resourceId', '@octo/tf-sg=sg-child'],
      ]);
    });

    it("should diff a resource of this app on a store parent's changed response", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      const storeState = JSON.parse((await storeStateProvider.getState('resources-actual.json')).toString());
      storeState.data.resources['@octo/external-igw=igw-1'].resource.response.igwId = 'igw-0changed';
      await storeStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify(storeState)), stateFileName: 'resources-actual.json' },
      ]);

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [getStoreResource('igw-1')]));
      const diffs = await testModes.resourceDataRepository.diff();

      expect(diffs.map((d) => [d.action, d.field, d.node.getContext()])).toEqual([
        ['update', 'parent', '@octo/tf-sg=sg-child'],
      ]);
    });

    it("should diff a resource of this app on a store parent's new name", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      const storeState = (await storeStateProvider.getState('resources-actual.json'))
        .toString()
        .replaceAll('igw-1', 'igw-2');
      await storeStateProvider.saveStates([{ data: Buffer.from(storeState), stateFileName: 'resources-actual.json' }]);

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [getStoreResource('igw-2')]));
      const diffs = await testModes.resourceDataRepository.diff();

      expect(diffs.map((d) => [d.action, d.field, d.node.getContext()])).toEqual([
        ['delete', 'parent', '@octo/tf-sg=sg-child'],
        ['add', 'parent', '@octo/tf-sg=sg-child'],
      ]);
    });

    it('should plan to delete a resource of this app standing on what a store deleted, once this app drops it', async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      const storeState = JSON.parse((await storeStateProvider.getState('resources-actual.json')).toString());
      delete storeState.data.resources['@octo/external-igw=igw-1'];
      storeState.data.resources['@octo/tf-sg=sg-1'].resource.parents = [];
      await storeStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify(storeState)), stateFileName: 'resources-actual.json' },
      ]);

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const diffs = await testModes.resourceDataRepository.diff();

      expect(diffs.map((d) => [d.action, d.field, d.node.getContext()])).toEqual([
        ['delete', 'resourceId', '@octo/tf-sg=sg-child'],
      ]);
    });

    it("should rebuild an extended state's resources on its copies of a store's, reading the store or not", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      await bootChild(new TestStateProvider());

      await testModes['octo'].extendState(childStateProvider);
      const sgChild = testModes.resourceDataRepository.getNewResourceByContext('@octo/tf-sg=sg-child')!;
      expect(Object.keys(sgChild.getParents())).toEqual(['external-igw']);

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      expect(Object.values(sgChild.getParents()).map(([p]) => p.to)).toEqual([getStoreResource('igw-1')]);
      expect(sgChild.parents[0]).toBe(getStoreResource('igw-1'));
    });

    it("should throw error when a store changed an extended state's parent since that state committed", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      const storeState = JSON.parse((await storeStateProvider.getState('resources-actual.json')).toString());
      storeState.data.resources['@octo/external-igw=igw-1'].resource.response.igwId = 'igw-0changed';
      await storeStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify(storeState)), stateFileName: 'resources-actual.json' },
      ]);
      await bootChild(new TestStateProvider());
      await testModes['octo'].extendState(childStateProvider);
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);

      await expect(
        testModes.generate(testModes['octo'].getRootModel(), { outputDir: testModes.outputDir }),
      ).rejects.toThrow(
        'Resource "@octo/tf-sg=sg-child" of module "child-module" of an extended state stands on ' +
          '"@octo/external-igw=igw-1", which changed since that app last committed; run that app first!',
      );
    });

    it("should build a store's link into a state this app does not read on the store's copy", async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      await bootChild(new TestStateProvider());

      await testModes['octo'].readStores([{ name: 'backend', stateProvider: childStateProvider }]);

      expect(Object.keys(getStoreResource('sg-child').getParents())).toEqual(['external-igw']);
    });

    it('should keep a link between two stores read here', async () => {
      const childStateProvider = new TestStateProvider();
      const storeStateProvider = await commitStoreState(childStateProvider);
      await commitChildOnStore(childStateProvider, storeStateProvider);
      await bootChild(new TestStateProvider());

      await testModes['octo'].readStores([
        { name: 'commons', stateProvider: storeStateProvider },
        { name: 'backend', stateProvider: childStateProvider },
      ]);

      expect(Object.keys(getStoreResource('sg-child').getParents())).toEqual(['external-igw']);
    });

    it('should declare once what this app extends and a store holds, freezing only the store', async () => {
      const { p, s } = await commitDiamondStates();

      await testModes['octo'].extendState(p);
      await testModes['octo'].readStores([{ name: 's', stateProvider: s }]);

      const inputService = testModes['octo']['inputService'];
      const app = inputService.resolve('app-module.model.app') as App;
      expect(inputService.resolve('s:app-module.model.app')).toBe(app);
      expect(Object.isFrozen(app)).toBe(false);
      const sg = testModes.resourceDataRepository.getNewResourceByContext('@octo/tf-sg=sg-s')!;
      expect(sg.parents).toEqual([
        testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1'),
      ]);
    });

    it('should read back a resource of this app standing on an extended state and a store at once', async () => {
      const childStateProvider = new TestStateProvider();
      const { p, s } = await commitDiamondStates();
      const declare = async (): Promise<App> => {
        await testModes['octo'].extendState(p);
        await testModes['octo'].readStores([{ name: 's', stateProvider: s }]);
        const igw = testModes.resourceDataRepository.getNewResourceByContext('@octo/external-igw=igw-1')!;
        const sg = testModes.resourceDataRepository.getNewResourceByContext('@octo/tf-sg=sg-s')!;
        await testModes.addResource('child-module', new TfSgResource('sg-child', {}, [igw, sg]));
        return testModes['octo'].getRootModel();
      };
      await bootChild(childStateProvider);
      const app = await declare();
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('child-module', { 'sg-child-SgId': 'sg-0child' });
      await testModes.commit(app, { outputs: testModes.outputs });
      await bootChild(childStateProvider);

      await declare();

      expect(await testModes.resourceDataRepository.diff()).toEqual([]);
    });

    it('should declare once what two stores hold, the store listed first winning', async () => {
      const { p, s } = await commitDiamondStates();

      await testModes['octo'].readStores([
        { name: 'p', stateProvider: p },
        { name: 's', stateProvider: s },
      ]);

      const inputService = testModes['octo']['inputService'];
      const app = inputService.resolve('p:app-module.model.app') as App;
      expect(inputService.resolve('s:app-module.model.app')).toBe(app);
      expect(Object.isFrozen(app)).toBe(true);
      expect(inputService.getModuleIdFromModel(app)).toBe('p:app-module');
    });

    it("should read a store's overlays under its name, so this app may build the same overlay id", async () => {
      const graph = await testModes.createResourceGraph();
      const storeAnchor = new TestAnchor('store-anchor', {}, graph.app);
      graph.app.addAnchor(storeAnchor);
      await testModes['testModuleContainer'].createTestOverlays('overlay-module', [
        { anchors: [storeAnchor], context: '@octo/test-overlay=overlay-1' },
      ]);
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
      await testModes.commit(graph.app, { outputs: testModes.outputs });
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      const childAnchor = new TestAnchor('child-anchor', {}, app);
      app.addAnchor(childAnchor);

      await testModes['testModuleContainer'].createTestOverlays('child-overlay-module', [
        { anchors: [childAnchor], context: '@octo/test-overlay=overlay-1' },
      ]);

      const overlayDataRepository = testModes['octo']['inputService']['overlayDataRepository'];
      expect(
        overlayDataRepository
          .getByProperties()
          .map((o) => o.getContext())
          .sort(),
      ).toEqual(['@octo/test-overlay=overlay-1', 'commons:@octo/test-overlay=overlay-1']);
    });

    it('should keep apart two stores whose apps build the same overlay id', async () => {
      const commitApp = async (name: string): Promise<TestStateProvider> => {
        const {
          app: [app],
        } = await testModes['testModuleContainer'].createTestModels('app-module', { app: [name] });
        const anchor = new TestAnchor('anchor', {}, app);
        app.addAnchor(anchor);
        await testModes['testModuleContainer'].createTestOverlays('overlay-module', [
          { anchors: [anchor], context: '@octo/test-overlay=overlay-1' },
        ]);
        await testModes.generate(app as App, { outputDir: testModes.outputDir });
        await testModes.commit(app as App, { outputs: testModes.outputs });
        const stateProvider = await copyState(new TestStateProvider());
        await bootChild(new TestStateProvider());
        return stateProvider;
      };
      const commons = await commitApp('commons-app');
      const backend = await commitApp('backend-app');

      await testModes['octo'].readStores([
        { name: 'commons', stateProvider: commons },
        { name: 'backend', stateProvider: backend },
      ]);

      const overlays = testModes['octo']['inputService']['overlayDataRepository'].getByProperties();
      expect(overlays.map((o) => [o.getContext(), o.getAnchors()[0].getParent().getContext()]).sort()).toEqual([
        ['backend:@octo/test-overlay=overlay-1', 'app=backend-app'],
        ['commons:@octo/test-overlay=overlay-1', 'app=commons-app'],
      ]);
    });

    it("should keep this app's boundary off a store's nodes", async () => {
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const storeApp = testModes['octo']['inputService'].resolve('commons:app-module.model.app') as App;
      const storeAnchor = new TestAnchor('store-anchor', {}, storeApp);
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      const childAnchor = new TestAnchor('child-anchor', {}, app);
      app.addAnchor(childAnchor);

      await testModes['testModuleContainer'].createTestOverlays('child-overlay-module', [
        { anchors: [childAnchor, storeAnchor], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(
        app
          .getBoundaryMembers()
          .map((m) => m.getContext())
          .sort(),
      ).toEqual(['@octo/test-overlay=overlay-1', 'app=child-app']);
    });

    it("should declare what a store's modules were given, their references under the store", async () => {
      testModes['octo']['moduleContainer'].register(ImportedAppModule, { packageName: '@octo' });
      testModes['octo']['moduleContainer'].register(ImportedAccountModule, { packageName: '@octo' });
      testModes['octo'].loadModule(ImportedAppModule, 'app-module', { name: 'test-app' });
      testModes['octo'].loadModule(ImportedAccountModule, 'account-module', {
        accountId: '123456789012',
        app: stub('${{app-module.model.app}}'),
      });
      await testModes['octo'].compose();
      const modelData = await testModes['octo']['modelSerializationService'].serialize(
        testModes['octo'].getRootModel(),
      );
      const storeStateProvider = new TestStateProvider();
      await storeStateProvider.saveStates([
        { data: Buffer.from(JSON.stringify({ data: modelData, userData: {} })), stateFileName: 'models.json' },
      ]);
      await bootChild(new TestStateProvider());
      testModes['octo']['modelSerializationService'].registerClass('@octo/Account', Account);

      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);

      const inputService = testModes['octo']['inputService'];
      expect(inputService.resolve('commons:account-module.input.app')).toBe(
        inputService.resolve('commons:app-module.model.app'),
      );
    });

    it("should restore this app's overlay anchors on a store, for an app reading both", async () => {
      const graph = await testModes.createResourceGraph();
      graph.app.addAnchor(new TestAnchor('store-anchor', {}, graph.app));
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
      await testModes.commit(graph.app, { outputs: testModes.outputs });
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const storeApp = testModes['octo']['inputService'].resolve('commons:app-module.model.app') as App;
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      const childAnchor = new TestAnchor('child-anchor', {}, app);
      app.addAnchor(childAnchor);
      const storeAnchor = storeApp.getAnchor('store-anchor')!;
      await testModes['testModuleContainer'].createTestOverlays('child-overlay-module', [
        { anchors: [childAnchor, storeAnchor], context: '@octo/test-overlay=overlay-1' },
      ]);
      await testModes.generate(app, { outputDir: testModes.outputDir });
      await testModes.commit(app, { outputs: testModes.outputs });
      const childStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());

      await testModes['octo'].readStores([
        { name: 'commons', stateProvider: storeStateProvider },
        { name: 'backend', stateProvider: childStateProvider },
      ]);

      const overlay = testModes['octo']['inputService']['overlayDataRepository'].getByContext(
        'backend:@octo/test-overlay=overlay-1',
      )!;
      expect(overlay.getAnchors().map((a) => a.getParent().getContext())).toEqual(['app=child-app', 'app=test-app']);
    });
    it("should leave out this app's overlay anchors on a store, for an app reading only this one", async () => {
      const graph = await testModes.createResourceGraph();
      graph.app.addAnchor(new TestAnchor('store-anchor', {}, graph.app));
      await testModes.generate(graph.app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
      await testModes.commit(graph.app, { outputs: testModes.outputs });
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const storeApp = testModes['octo']['inputService'].resolve('commons:app-module.model.app') as App;
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      const childAnchor = new TestAnchor('child-anchor', {}, app);
      app.addAnchor(childAnchor);
      const storeAnchor = storeApp.getAnchor('store-anchor')!;
      await testModes['testModuleContainer'].createTestOverlays('child-overlay-module', [
        { anchors: [childAnchor, storeAnchor], context: '@octo/test-overlay=overlay-1' },
      ]);
      await testModes.generate(app, { outputDir: testModes.outputDir });
      await testModes.commit(app, { outputs: testModes.outputs });
      const childStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());

      await testModes['octo'].readStores([{ name: 'backend', stateProvider: childStateProvider }]);

      const overlay = testModes['octo']['inputService']['overlayDataRepository'].getByContext(
        'backend:@octo/test-overlay=overlay-1',
      )!;
      expect(overlay.getAnchors().map((a) => a.getParent().getContext())).toEqual(['app=child-app']);
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

    it("should run the action of this app's resource standing on a store's", async () => {
      await generateAndCommitFullGraph();
      const storeStateProvider = await copyState(new TestStateProvider());
      await bootChild(new TestStateProvider());
      await testModes['octo'].readStores([{ name: 'commons', stateProvider: storeStateProvider }]);
      const {
        app: [app],
      } = await testModes['testModuleContainer'].createTestModels('child-app-module', { app: ['child-app'] });
      const vpc = testModes.resourceDataRepository.getNewResourceByContext('@octo/tf-vpc=vpc-1')!;
      await testModes.addResource(
        'child-module',
        new ExternalIgwResource('igw-child', { Type: 'internet-gateway' }, [vpc]),
      );

      const result = await testModes.runAction(app as App, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-child',
      });

      expect(result.action).toBe('add');
      expect(result.resourceId).toBe('igw-child');
    });
  });
});
