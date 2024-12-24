import { jest } from '@jest/globals';
import { type App, type Container, TestContainer, TestModuleContainer, TestStateProvider, stub } from '@quadnix/octo';
import { AwsAccountModule } from './aws-account.module.js';
import { AddAccountModelAction } from './models/account/actions/add-account.model.action.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('AwsAccountModule UT', () => {
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

  it('should call actions with correct inputs', async () => {
    const addAccountModelAction = await container.get(AddAccountModelAction);
    const addAccountModelActionSpy = jest.spyOn(addAccountModelAction, 'handle');

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAccountModule>({
      inputs: {
        accountId: '1234',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsAccountModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });
    expect(addAccountModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addAccountModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "accountId": "1234",
         "app": {
           "context": "app=test-app",
           "name": "test-app",
         },
         "iniProfile": "default",
       },
       "models": {
         "account": {
           "accountId": "1234",
           "accountType": "aws",
           "context": "account=1234,app=test-app",
           "iniProfile": "default",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);
  });

  it('should CUD', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAccountModule>({
      inputs: {
        accountId: '1234',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsAccountModule,
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
