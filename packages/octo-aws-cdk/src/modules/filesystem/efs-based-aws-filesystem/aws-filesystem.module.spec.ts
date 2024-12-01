import { EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import { type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AddEfsResourceAction } from '../../../resources/efs/actions/add-efs.resource.action.js';
import type { Efs } from '../../../resources/efs/index.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsFilesystemModule } from './aws-filesystem.module.js';
import { AddFilesystemModelAction } from './models/filesystem/actions/add-filesystem.model.action.js';

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
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call all actions correctly', async () => {
    const addFilesystemModelAction = await container.get(AddFilesystemModelAction);
    const addFilesystemModelActionSpy = jest.spyOn(addFilesystemModelAction, 'handle');
    const addEfsResourceAction = await container.get(AddEfsResourceAction);
    const addEfsResourceActionSpy = jest.spyOn(addEfsResourceAction, 'handle');

    testModuleContainer.registerCapture<Efs>('@octo/efs=efs-region-test-filesystem', {
      FileSystemArn: 'FileSystemArn',
      FileSystemId: 'FileSystemId',
    });

    // Create an app, account, and region.
    const {
      account: [account],
      app: [app],
    } = await testModuleContainer.createTestModels('testModule', {
      account: ['aws,account'],
      app: ['test-app'],
      region: ['region'],
    });
    jest.spyOn(account, 'getCredentials').mockReturnValue({});

    // Create a filesystem.
    await testModuleContainer.runModule<AwsFilesystemModule>({
      inputs: {
        awsRegionId: 'us-east-1',
        filesystemName: 'test-filesystem',
        region: '${{testModule.model.region}}',
      },
      moduleId: 'filesystem',
      type: AwsFilesystemModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addFilesystemModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addFilesystemModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "awsRegionId": "us-east-1",
         "filesystemName": "test-filesystem",
         "region": {
           "context": "region=region,account=account,app=test-app",
           "regionId": "region",
         },
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

  it('should create and delete a new filesystem', async () => {
    testModuleContainer.registerCapture<Efs>('@octo/efs=efs-region-test-filesystem', {
      FileSystemArn: 'FileSystemArn',
      FileSystemId: 'FileSystemId',
    });

    // Create an app, account, and region.
    const {
      account: [account1],
      app: [app1],
    } = await testModuleContainer.createTestModels('testModule', {
      account: ['aws,account'],
      app: ['test-app'],
      region: ['region'],
    });
    jest.spyOn(account1, 'getCredentials').mockReturnValue({});

    // Create a filesystem.
    await testModuleContainer.runModule<AwsFilesystemModule>({
      inputs: {
        awsRegionId: 'us-east-1',
        filesystemName: 'test-filesystem',
        region: '${{testModule.model.region}}',
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

    // Create an app, account, and region.
    const {
      account: [account2],
      app: [app2],
    } = await testModuleContainer.createTestModels('testModule', {
      account: ['aws,account'],
      app: ['test-app'],
      region: ['region'],
    });
    jest.spyOn(account2, 'getCredentials').mockReturnValue({});

    // Commit without creation the filesystem. This should yield the previous model being deleted.
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
