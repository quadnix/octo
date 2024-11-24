import { jest } from '@jest/globals';
import { App, type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AwsAccountModule } from './aws-account.module.js';
import { AddAccountModelAction } from './models/account/actions/add-account.model.action.js';

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

  it('should call AddAccountModelAction with correct inputs', async () => {
    const addAccountModelAction = await container.get(AddAccountModelAction);
    const addAccountModelActionSpy = jest.spyOn(addAccountModelAction, 'handle');

    // Create an app.
    const {
      app: [app],
    } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });

    // Create an account.
    await testModuleContainer.runModule<AwsAccountModule>({
      inputs: {
        accountId: '1234',
        app: '${testModule.model.app}',
      },
      moduleId: 'account',
      type: AwsAccountModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addAccountModelActionSpy).toHaveBeenCalledTimes(1);

    const actionInputs = addAccountModelActionSpy.mock.calls[0][1];
    expect(actionInputs['account.input.accountId']).toBe('1234');
    expect(actionInputs['account.input.app'] instanceof App).toBeTruthy();
  });

  it('should create a new account', async () => {
    // Create an app.
    const {
      app: [app],
    } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });

    // Create an account.
    await testModuleContainer.runModule<AwsAccountModule>({
      inputs: {
        accountId: '1234',
        app: '${testModule.model.app}',
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
