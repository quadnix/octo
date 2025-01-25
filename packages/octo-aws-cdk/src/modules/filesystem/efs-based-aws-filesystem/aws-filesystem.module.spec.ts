import { EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Region,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { type EfsSchema } from '../../../resources/efs/index.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsFilesystemModule } from './aws-filesystem.module.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  await testModuleContainer.createTestResources(
    'testModule',
    [
      {
        properties: { awsAvailabilityZones: ['us-east-1a'], awsRegionId: 'us-east-1' },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
      },
    ],
    { save: true },
  );

  return { account, app, region };
}

describe('AwsFilesystemModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
            type: EFSClient,
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

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0 });
    });

    // Register resource captures.
    testModuleContainer.registerCapture<EfsSchema>('@octo/efs=efs-region-test-filesystem', {
      FileSystemArn: 'FileSystemArn',
      FileSystemId: 'FileSystemId',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsFilesystemModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['filesystem'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddFilesystemModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddEfsResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsFilesystemModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": "@octo/efs=efs-region-test-filesystem",
         },
       ],
       [],
     ]
    `);

    const { app: app2 } = await setup(testModuleContainer);

    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": "@octo/efs=efs-region-test-filesystem",
         },
       ],
       [],
     ]
    `);
  });
});
