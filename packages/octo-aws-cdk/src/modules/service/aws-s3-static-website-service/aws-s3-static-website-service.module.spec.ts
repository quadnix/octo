import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsS3StaticWebsiteServiceModule } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  return { account, app };
}

describe('AwsS3StaticWebsiteServiceModule UT', () => {
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
          {
            metadata: { package: '@octo' },
            type: 'Upload',
            value: class {
              done(): Promise<void> {
                return Promise.resolve();
              }
            },
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
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['service'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsS3StaticWebsiteServiceModelAction",
       ],
       [
         "UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddS3WebsiteResourceAction",
       ],
       [
         "UpdateSourcePathsInS3WebsiteResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": "@octo/s3-website=bucket-test-bucket",
         },
         {
           "action": "update",
           "field": "update-source-paths",
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": {
             "error.html": [
               "add",
               "${websiteSourcePath}/error.html",
             ],
             "index.html": [
               "add",
               "${websiteSourcePath}/index.html",
             ],
             "page-1.html": [
               "add",
               "${websiteSourcePath}/page-1.html",
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: appUpdateNoChange } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultUpdateNoChange = await testModuleContainer.commit(appUpdateNoChange, { enableResourceCapture: true });
    expect(resultUpdateNoChange.resourceDiffs).toMatchInlineSnapshot(`
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
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": "@octo/s3-website=bucket-test-bucket",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": "@octo/s3-website=bucket-test-bucket",
         },
         {
           "action": "update",
           "field": "update-source-paths",
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": {
             "error.html": [
               "add",
               "${websiteSourcePath}/error.html",
             ],
             "index.html": [
               "add",
               "${websiteSourcePath}/index.html",
             ],
             "page-1.html": [
               "add",
               "${websiteSourcePath}/page-1.html",
             ],
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/s3-website=bucket-test-bucket",
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
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/s3-website=bucket-test-bucket",
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
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/s3-website=bucket-test-bucket",
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

  it('should handle moduleId changes', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service-1',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": "@octo/s3-website=bucket-test-bucket",
         },
         {
           "action": "update",
           "field": "update-source-paths",
           "node": "@octo/s3-website=bucket-test-bucket",
           "value": {
             "error.html": [
               "add",
               "${websiteSourcePath}/error.html",
             ],
             "index.html": [
               "add",
               "${websiteSourcePath}/index.html",
             ],
             "page-1.html": [
               "add",
               "${websiteSourcePath}/page-1.html",
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service-2',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  describe('validation', () => {
    it('should handle awsRegionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-west-2',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateRegionId, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update S3 Bucket accountId or regionId once it has been created!"`,
      );
    });

    it('should handle bucketName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateBucketName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'changed-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
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
             "node": "@octo/s3-website=bucket-test-bucket",
             "value": "@octo/s3-website=bucket-test-bucket",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/s3-website=bucket-changed-bucket",
             "value": "@octo/s3-website=bucket-changed-bucket",
           },
           {
             "action": "update",
             "field": "update-source-paths",
             "node": "@octo/s3-website=bucket-changed-bucket",
             "value": {
               "error.html": [
                 "add",
                 "${websiteSourcePath}/error.html",
               ],
               "index.html": [
                 "add",
                 "${websiteSourcePath}/index.html",
               ],
               "page-1.html": [
                 "add",
                 "${websiteSourcePath}/page-1.html",
               ],
             },
           },
         ],
         [],
       ]
      `);
    });

    it('should handle directoryPath change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateDirectoryPath } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath + '/index.html',
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      const resultUpdateDirectoryPath = await testModuleContainer.commit(appUpdateDirectoryPath, {
        enableResourceCapture: true,
      });
      expect(resultUpdateDirectoryPath.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "update-source-paths",
             "node": "@octo/s3-website=bucket-test-bucket",
             "value": {
               "error.html": [
                 "delete",
                 "",
               ],
               "page-1.html": [
                 "delete",
                 "",
               ],
             },
           },
         ],
         [],
       ]
      `);
    });
  });
});
