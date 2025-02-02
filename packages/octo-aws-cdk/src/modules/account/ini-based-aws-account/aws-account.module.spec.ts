import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { type App, TestContainer, TestModuleContainer, TestStateProvider, stub } from '@quadnix/octo';
import { AwsAccountModule } from './aws-account.module.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('AwsAccountModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', package: '@octo' },
            type: STSClient,
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
    await testModuleContainer.initialize(new TestStateProvider());

    // Mock GetCallerIdentityCommand() in STS.
    const stsClient = await container.get(STSClient, { metadata: { awsAccountId: '123', package: '@octo' } });
    stsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof GetCallerIdentityCommand) {
        return { Account: '123' };
      }
    };
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsAccountModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['account'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAccountModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAccountModule>({
      inputs: {
        accountId: '123',
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
