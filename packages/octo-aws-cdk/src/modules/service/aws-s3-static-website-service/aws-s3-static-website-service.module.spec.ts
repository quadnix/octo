import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { type Account, type App, TestContainer, TestModuleContainer, TestStateProvider, stub } from '@quadnix/octo';
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
    await testModuleContainer.initialize(new TestStateProvider());
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
    const { app: app1 } = await setup(testModuleContainer);
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
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app2 } = await setup(testModuleContainer);
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
    const { app: app1 } = await setup(testModuleContainer);
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
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
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
               "/Users/rash/Workspace/quadnix/octo/packages/octo-aws-cdk/resources/s3-static-website/error.html",
             ],
             "index.html": [
               "add",
               "/Users/rash/Workspace/quadnix/octo/packages/octo-aws-cdk/resources/s3-static-website/index.html",
             ],
             "page-1.html": [
               "add",
               "/Users/rash/Workspace/quadnix/octo/packages/octo-aws-cdk/resources/s3-static-website/page-1.html",
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
    const { app: app2 } = await setup(testModuleContainer);
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
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app3 } = await setup(testModuleContainer);
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
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
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
});
