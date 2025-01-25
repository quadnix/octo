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
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AddS3WebsiteResourceAction } from '../../../resources/s3-website/actions/add-s3-website.resource.action.js';
import { UpdateSourcePathsInS3WebsiteResourceAction } from '../../../resources/s3-website/actions/update-source-paths-in-s3-website.resource.action.js';
import { AwsS3StaticWebsiteServiceModule } from './aws-s3-static-website.service.module.js';
import { AddS3StaticWebsiteModelAction } from './models/s3-static-website/actions/add-s3-static-website.model.action.js';
import { UpdateSourcePathsS3StaticWebsiteModelAction } from './models/s3-static-website/actions/update-source-paths-s3-static-website.model.action.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

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

describe('AwsS3StaticWebsiteServiceModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
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
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addS3StaticWebsiteModelAction = await container.get(AddS3StaticWebsiteModelAction);
    const addS3StaticWebsiteModelActionSpy = jest.spyOn(addS3StaticWebsiteModelAction, 'handle');
    const updateSourcePathsS3StaticWebsiteModelAction = await container.get(
      UpdateSourcePathsS3StaticWebsiteModelAction,
    );
    const updateSourcePathsS3StaticWebsiteModelActionSpy = jest.spyOn(
      updateSourcePathsS3StaticWebsiteModelAction,
      'handle',
    );
    const addS3WebsiteResourceAction = await container.get(AddS3WebsiteResourceAction);
    const addS3WebsiteResourceActionSpy = jest.spyOn(addS3WebsiteResourceAction, 'handle');
    const updateSourcePathsInS3WebsiteResourceAction = await container.get(UpdateSourcePathsInS3WebsiteResourceAction);
    const updateSourcePathsInS3WebsiteResourceActionSpy = jest.spyOn(
      updateSourcePathsInS3WebsiteResourceAction,
      'handle',
    );

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addS3StaticWebsiteModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addS3StaticWebsiteModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "bucketName": "test-bucket",
         "directoryPath": "${websiteSourcePath}",
         "filter": null,
         "region": {
           "context": "region=region,account=123,app=test-app",
           "regionId": "region",
         },
         "subDirectoryOrFilePath": null,
         "transform": null,
       },
       "metadata": {
         "awsAccountId": "123",
         "awsRegionId": "us-east-1",
       },
       "models": {
         "service": {
           "bucketName": "test-bucket",
           "context": "service=test-bucket-s3-static-website,app=test-app",
           "excludePaths": [],
           "serviceId": "test-bucket-s3-static-website",
           "sourcePaths": [
             {
               "directoryPath": "${websiteSourcePath}",
               "isDirectory": true,
               "remotePath": "",
               "subDirectoryOrFilePath": "",
             },
           ],
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);

    expect(updateSourcePathsS3StaticWebsiteModelActionSpy).toHaveBeenCalledTimes(1);

    expect(addS3WebsiteResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addS3WebsiteResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/s3-website=bucket-test-bucket",
       "value": "@octo/s3-website=bucket-test-bucket",
     }
    `);

    expect(updateSourcePathsInS3WebsiteResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(updateSourcePathsInS3WebsiteResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
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
     }
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
        region: stub('${{testModule.model.region}}'),
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
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
        region: stub('${{testModule.model.region}}'),
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
});
