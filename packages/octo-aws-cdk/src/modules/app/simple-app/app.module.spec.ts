import { TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AppModule } from './index.js';

describe('AppModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app: app } = await testModuleContainer.runModule<AppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: AppModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['app'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAppModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: app } = await testModuleContainer.runModule<AppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: AppModule,
    });

    const result = await testModuleContainer.commit(app, { enableResourceCapture: true });
    expect(result.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
