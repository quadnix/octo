import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsS3StorageServiceModule } from './index.js';

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

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsS3StorageServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);
  const S3ClientMock = mockClient(S3Client);

  beforeEach(async () => {
    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    S3ClientMock.on(ListObjectsV2Command).resolves({ Contents: [] });

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: S3Client,
            value: S3ClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();
  });

  afterEach(async () => {
    ResourceGroupsTaggingAPIClientMock.restore();
    S3ClientMock.restore();

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
         "AddAwsS3StorageServiceModelAction",
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
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
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
    const { app: appAddDirectory } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultAddDirectory = await testModuleContainer.commit(appAddDirectory, { enableResourceCapture: true });
    expect(resultAddDirectory.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
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

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": "@octo/s3-storage=bucket-test-bucket",
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": {
             "add": {
               "tag1": "value1",
             },
             "delete": [],
             "update": {},
           },
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
       ],
       [],
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
       ],
       [],
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle bucketName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StorageServiceModule>({
        inputs: {
          bucketName: 'test-bucket',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'service',
        type: AwsS3StorageServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateBucketName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StorageServiceModule>({
        inputs: {
          bucketName: 'changed-bucket',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'service',
        type: AwsS3StorageServiceModule,
      });
      const resultUpdateBucketName = await testModuleContainer.commit(appUpdateBucketName, {
        enableResourceCapture: true,
      });
      expect(resultUpdateBucketName.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/s3-storage=bucket-test-bucket",
             "value": "@octo/s3-storage=bucket-test-bucket",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/s3-storage=bucket-changed-bucket",
             "value": "@octo/s3-storage=bucket-changed-bucket",
           },
         ],
         [],
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service-1',
      type: AwsS3StorageServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service-2',
      type: AwsS3StorageServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
