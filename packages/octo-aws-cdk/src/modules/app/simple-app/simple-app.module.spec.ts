import { type App, DiffAssert, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert, type HclShape } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { SimpleAppModule } from './index.js';

const BASE_HCL_SHAPE: HclShape = {};

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('SimpleAppModule UT', () => {
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
    const { 'app.model.app': app } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['app'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddSimpleAppModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
    hcl.assert();
  });

  it('should CUD', async () => {
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
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
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasNoChanges();
    hcl.assert();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { 'app.model.app': appUpdateTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    new DiffAssert(resultUpdateTags.resourceDiffs).hasNoChanges();
    hcl.assert();

    const { 'app.model.app': appDeleteTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    new DiffAssert(resultDeleteTags.resourceDiffs).hasNoChanges();
    hcl.assert();
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'test-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { 'app.model.app': appUpdateName } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'changed-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      const resultUpdateName = await testModuleContainer.commit(appUpdateName, { enableResourceCapture: true });
      new DiffAssert(resultUpdateName.resourceDiffs).hasNoChanges();
      hcl.assertShape({});
    });
  });

  it('should handle moduleId change', async () => {
    const { 'app-1.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-1',
      type: SimpleAppModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.assert();

    const { 'app-2.model.app': appUpdateModuleId } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-2',
      type: SimpleAppModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    new DiffAssert(resultUpdateModuleId.resourceDiffs).hasNoChanges();
    hcl.assert();
  });

  describe('validation', () => {
    it('should validate name length', async () => {
      await expect(async () => {
        await testModuleContainer.runModule<SimpleAppModule>({
          inputs: { name: '' },
          moduleId: 'app',
          type: SimpleAppModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "name" in schema could not be validated!"`);
    });
  });
});
