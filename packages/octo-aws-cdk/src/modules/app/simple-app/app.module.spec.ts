import { jest } from '@jest/globals';
import { type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AppModule } from './index.js';
import { AddAppModelAction } from './models/app/actions/add-app.model.action.js';

describe('AppModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call AddAppModelAction with correct inputs', async () => {
    const addAppModelAction = await container.get(AddAppModelAction);
    const addAppModelActionSpy = jest.spyOn(addAppModelAction, 'handle');

    const { app: app } = await testModuleContainer.runModule<AppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: AppModule,
    });

    await testModuleContainer.commit(app);

    expect(addAppModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addAppModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "name": "test-app",
       },
       "models": {
         "app": {
           "context": "app=test-app",
           "name": "test-app",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);
  });

  it('should be able to add a new app', async () => {
    const { app: app } = await testModuleContainer.runModule<AppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: AppModule,
    });

    const result = await testModuleContainer.commit(app);
    expect(result.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
