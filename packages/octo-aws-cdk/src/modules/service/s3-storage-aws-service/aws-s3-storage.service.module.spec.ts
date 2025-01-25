import { S3Client } from '@aws-sdk/client-s3';
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
import { AwsS3StorageServiceModule } from './aws-s3-storage.service.module.js';

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
    [{ properties: { awsRegionId: 'us-east-1' }, resourceContext: '@octo/vpc=vpc-region' }],
    { save: true },
  );

  return { account, app, region };
}

describe('AwsS3StorageServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
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

  it('should call correct actions', async () => {
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

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['service'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddS3StorageServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddS3StorageResourceAction",
       ],
     ]
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
