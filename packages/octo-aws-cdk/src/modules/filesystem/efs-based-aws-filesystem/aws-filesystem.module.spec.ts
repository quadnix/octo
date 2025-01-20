import { EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Container,
  type Region,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddEfsResourceAction } from '../../../resources/efs/actions/add-efs.resource.action.js';
import type { Efs } from '../../../resources/efs/index.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsFilesystemModule } from './aws-filesystem.module.js';
import { AddFilesystemModelAction } from './models/filesystem/actions/add-filesystem.model.action.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,account'],
    app: ['test-app'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  await testModuleContainer.createTestResources(
    'testModule',
    [{ properties: { awsRegionId: 'us-east-1' }, resourceContext: '@octo/vpc=vpc-region' }],
    { save: true },
  );

  return { account, app, region };
}

describe('AwsFilesystemModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let container: Container;
  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
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
    testModuleContainer.registerCapture<Efs>('@octo/efs=efs-region-test-filesystem', {
      FileSystemArn: 'FileSystemArn',
      FileSystemId: 'FileSystemId',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call actions with correct inputs', async () => {
    const addFilesystemModelAction = await container.get(AddFilesystemModelAction);
    const addFilesystemModelActionSpy = jest.spyOn(addFilesystemModelAction, 'handle');
    const addEfsResourceAction = await container.get(AddEfsResourceAction);
    const addEfsResourceActionSpy = jest.spyOn(addEfsResourceAction, 'handle');

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsFilesystemModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addFilesystemModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addFilesystemModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "filesystemName": "test-filesystem",
         "region": {
           "context": "region=region,account=account,app=test-app",
           "regionId": "region",
         },
       },
       "metadata": {
         "awsAccountId": "account",
         "awsRegionId": "us-east-1",
       },
       "models": {
         "filesystem": {
           "context": "filesystem=test-filesystem,region=region,account=account,app=test-app",
           "filesystemName": "test-filesystem",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);

    expect(addEfsResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addEfsResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/efs=efs-region-test-filesystem",
       "value": "@octo/efs=efs-region-test-filesystem",
     }
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
