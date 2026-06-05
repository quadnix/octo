import { type App, DiffAssert, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert, type HclShape } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsIniAccountModule } from './index.js';

const BASE_HCL_SHAPE: HclShape = {};

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('AwsIniAccountModule UT', () => {
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();

    hcl = new HclAssert(octoTerraform, BASE_HCL_SHAPE);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['account'],
    });

    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsIniAccountModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
    hcl.assert();
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasNoChanges();
    hcl.assert();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    new DiffAssert(resultDelete.resourceDiffs).hasNoChanges();
    hcl.assertShape({});

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasNoChanges();
    hcl.assert();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    new DiffAssert(resultUpdateTags.resourceDiffs).hasNoChanges();
    hcl.assert();

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    new DiffAssert(resultDeleteTags.resourceDiffs).hasNoChanges();
    hcl.assert();
  });

  describe('input changes', () => {
    it('should handle accountId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '456',
          app: stub('${{testModule.model.app}}'),
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
      new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
      hcl.assert();
    });

    it('should handle iniProfile change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          iniProfile: 'default',
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          iniProfile: 'production',
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
      new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
      hcl.assert();
    });

    it('should handle endpoints change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          endpoints: {},
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          endpoints: { s3: 'http://localhost:4566' },
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
      new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
      hcl.assert();
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account-1',
      type: AwsIniAccountModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.assert();

    const { app: appUpdate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account-2',
      type: AwsIniAccountModule,
    });
    const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
    new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
    hcl.assert();
  });

  describe('validation', () => {
    it('should validate accountId is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsIniAccountModule>({
          inputs: {
            accountId: '',
            app: stub('${{testModule.model.app}}'),
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "accountId" in schema could not be validated!"`);
    });

    it('should validate iniProfile is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsIniAccountModule>({
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
            iniProfile: '',
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "iniProfile" in schema could not be validated!"`);
    });

    it('should validate endpoints values are not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsIniAccountModule>({
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
            endpoints: { s3: '' },
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "endpoints" in schema could not be validated!"`);
    });
  });
});
