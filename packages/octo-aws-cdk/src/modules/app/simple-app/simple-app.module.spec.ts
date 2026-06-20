import { type App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { SimpleAppModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('SimpleAppModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
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

    // The app module creates no resources, so it renders no terraform.
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`""`);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['app'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddSimpleAppModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { 'app.model.app': appUpdateTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { 'app.model.app': appDeleteTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'test-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      await testModuleContainer.commit(appCreate);

      const { 'app.model.app': appUpdateName } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'changed-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateName)).toMatchSnapshot();
      const resultUpdateName = await testModuleContainer.commit(appUpdateName);
      expect(testModuleContainer.digestDiffs(resultUpdateName.resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  it('should handle moduleId change', async () => {
    const { 'app-1.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-1',
      type: SimpleAppModule,
    });
    await testModuleContainer.commit(appCreate);

    const { 'app-2.model.app': appUpdateModuleId } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-2',
      type: SimpleAppModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
