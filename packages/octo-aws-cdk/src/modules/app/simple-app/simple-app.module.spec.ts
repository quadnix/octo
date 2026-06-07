import { type App, DiffAssert, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { SimpleAppModule } from './index.js';

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

    hcl = new HclAssert(octoTerraform);
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
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(octoTerraform.render()).toMatchInlineSnapshot(`
     "terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source  = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }"
    `);
  });

  it('should CUD', async () => {
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();

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
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { 'app.model.app': appUpdateTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();

    const { 'app.model.app': appDeleteTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'test-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { 'app.model.app': appUpdateName } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'changed-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      const resultUpdateName = await testModuleContainer.commit(appUpdateName, { enableResourceCapture: true });
      expect(new DiffAssert(resultUpdateName.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
      expect(hcl.digest()).toMatchSnapshot();
    });
  });

  it('should handle moduleId change', async () => {
    const { 'app-1.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-1',
      type: SimpleAppModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(hcl.digest()).toMatchSnapshot();

    const { 'app-2.model.app': appUpdateModuleId } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-2',
      type: SimpleAppModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
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
