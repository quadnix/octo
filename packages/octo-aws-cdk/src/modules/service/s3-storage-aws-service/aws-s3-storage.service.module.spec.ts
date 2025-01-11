import { S3Client } from '@aws-sdk/client-s3';
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
import { AddS3StorageResourceAction } from '../../../resources/s3-storage/actions/add-s3-storage.resource.action.js';
import { AwsS3StorageServiceModule } from './aws-s3-storage.service.module.js';
import { AddS3StorageServiceModelAction } from './models/s3-storage/actions/add-s3-storage-service.model.action.js';

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

describe('AwsS3StorageServiceModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsRegionId: 'us-east-1', package: '@octo' },
            type: S3Client,
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
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addS3StorageServiceModelAction = await container.get(AddS3StorageServiceModelAction);
    const addS3StorageServiceModelActionSpy = jest.spyOn(addS3StorageServiceModelAction, 'handle');
    const addS3StorageResourceAction = await container.get(AddS3StorageResourceAction);
    const addS3StorageResourceActionSpy = jest.spyOn(addS3StorageResourceAction, 'handle');

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    /* eslint-disable spellcheck/spell-checker */
    expect(addS3StorageServiceModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addS3StorageServiceModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "bucketName": "test-bucket",
         "region": {
           "context": "region=region,account=account,app=test-app",
           "regionId": "region",
         },
         "remoteDirectoryPaths": [
           "uploads",
         ],
       },
       "models": {
         "service": {
           "bucketName": "test-bucket",
           "context": "service=test-bucket-s3-storage,app=test-app",
           "directories": [
             {
               "directoryAnchorName": "AwsS3DirectoryAnchor-fb611de45b88",
               "remoteDirectoryPath": "uploads",
             },
           ],
           "serviceId": "test-bucket-s3-storage",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);
    /* eslint-enable */

    expect(addS3StorageResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addS3StorageResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/s3-storage=bucket-test-bucket",
       "value": "@octo/s3-storage=bucket-test-bucket",
     }
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": "@octo/s3-storage=bucket-test-bucket",
         },
       ],
       [],
     ]
    `);

    // Adding directories should have no effect as they only create anchors.
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": "@octo/s3-storage=bucket-test-bucket",
         },
       ],
       [],
     ]
    `);
  });
});
