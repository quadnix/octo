import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { TestContainer, TestModuleContainer } from '@quadnix/octo';
import { SimpleAppModule } from './index.js';

describe('SimpleAppModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();
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
  });

  it('should CUD', async () => {
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { 'app.model.app': appUpdateTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { 'app.model.app': appDeleteTags } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { 'app.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'test-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { 'app.model.app': appUpdateName } = await testModuleContainer.runModule<SimpleAppModule>({
        inputs: { name: 'changed-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      });
      const resultUpdateName = await testModuleContainer.commit(appUpdateName, { enableResourceCapture: true });
      expect(resultUpdateName.resourceDiffs).toMatchInlineSnapshot(`
       [
         [],
         [],
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { 'app-1.model.app': appCreate } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-1',
      type: SimpleAppModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

    const { 'app-2.model.app': appUpdateModuleId } = await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app-2',
      type: SimpleAppModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
