import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { type AModule, type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { type AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { type SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { type AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteSourcePath = join(__dirname, 'website');

describe('Main E2E', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  const STSClientMock = mockClient(STSClient);

  const moduleDefinitions = new ModuleDefinitions();
  const accountId = moduleDefinitions.get<AwsIniAccountModule>('account-module')!.moduleInputs.accountId;
  const bucketName =
    moduleDefinitions.get<AwsS3StaticWebsiteServiceModule>('s3-website-service-module')!.moduleInputs.bucketName;

  const stateProvider = new TestStateProvider();

  beforeEach(async () => {
    STSClientMock.on(GetCallerIdentityCommand).resolves({ Account: accountId });

    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: STSClient,
            value: STSClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(stateProvider, [
      { type: HtmlReportEventListener },
      { type: LoggingEventListener },
    ]);

    // Register tags on all resources.
    testModuleContainer.octo.registerTags([
      { scope: {}, tags: { 'e2e-test': 'true', 'e2e-test-family': 'aws-s3-website' } },
    ]);
  });

  afterEach(async () => {
    STSClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should have website available', async () => {
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    await testModuleContainer.commit(app);

    const indexContent = await axios.get(`http://${bucketName}.s3-website-us-east-1.amazonaws.com/index.html`);
    expect(indexContent.data).toContain('This is my first website!');
    const errorContent = await axios.get(`http://${bucketName}.s3-website-us-east-1.amazonaws.com/error.html`);
    expect(errorContent.data).toContain('This is an error!');
  }, 60_000);

  describe('input changes', () => {
    describe('SimpleAppModule', () => {
      it('should handle name change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs: md.moduleId === 'app-module' ? { ...md.moduleInputs, name: 'changed-name' } : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [],
           [],
         ]
        `);
      });
    });

    describe('AwsIniAccountModule', () => {
      it('should handle accountId change', async () => {
        STSClientMock.restore();
        STSClientMock.on(GetCallerIdentityCommand).resolves({ Account: 'changed-account-id' });

        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'account-module'
                ? { ...md.moduleInputs, accountId: 'changed-account-id' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update S3 Bucket accountId or regionId once it has been created!]`,
        );
      });
    });

    describe('AwsS3StaticWebsiteServiceModule', () => {
      it('should handle awsRegionId change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 's3-website-service-module'
                ? { ...md.moduleInputs, awsRegionId: 'us-west-2' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update S3 Bucket accountId or regionId once it has been created!]`,
        );
      });

      it('should handle bucketName change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 's3-website-service-module'
                ? { ...md.moduleInputs, bucketName: 'new-bucket-name' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/s3-website=bucket-octo-test-website-com",
               "value": "@octo/s3-website=bucket-octo-test-website-com",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/s3-website=bucket-new-bucket-name",
               "value": "@octo/s3-website=bucket-new-bucket-name",
             },
             {
               "action": "update",
               "field": "update-source-paths",
               "node": "@octo/s3-website=bucket-new-bucket-name",
               "value": {
                 "error.html": [
                   "add",
                   "${websiteSourcePath}/error.html",
                 ],
                 "index.html": [
                   "add",
                   "${websiteSourcePath}/index.html",
                 ],
               },
             },
             {
               "action": "update",
               "field": "tags",
               "node": "@octo/s3-website=bucket-new-bucket-name",
               "value": {
                 "add": {
                   "e2e-test": "true",
                   "e2e-test-family": "aws-s3-website",
                 },
                 "delete": [],
                 "update": {},
               },
             },
           ],
           [],
         ]
        `);
      });

      it('should handle directoryPath change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 's3-website-service-module'
                ? { ...md.moduleInputs, directoryPath: websiteSourcePath + '/index.html' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "update-source-paths",
               "node": "@octo/s3-website=bucket-octo-test-website-com",
               "value": {
                 "error.html": [
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

  it('should ensure website edits', async () => {
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );

    const originalErrorContent = await readFile(join(websiteSourcePath, 'error.html'), 'utf-8');
    try {
      await writeFile(join(websiteSourcePath, 'error.html'), 'New error content!');

      await testModuleContainer.commit(app);

      const newErrorContent = await axios.get(`http://${bucketName}.s3-website-us-east-1.amazonaws.com/error.html`);
      expect(newErrorContent.data).toContain('New error content!');
    } finally {
      // Restore error.html
      await writeFile(join(websiteSourcePath, 'error.html'), originalErrorContent);
    }
  }, 60_000);

  it('should have no resources left after teardown', async () => {
    const appModule = moduleDefinitions.get<SimpleAppModule>('app-module')!;
    const accountModule = moduleDefinitions.get<AwsIniAccountModule>('account-module')!;

    await testModuleContainer.orderModules([appModule.module, accountModule.module]);
    const { 'app-module.model.app': app } = await testModuleContainer.runModules<AModule<any, any>>(
      [appModule, accountModule].map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    await testModuleContainer.commit(app);

    const resourceGroupsTaggingApiClient = await container.get<ResourceGroupsTaggingAPIClient, any>(
      ResourceGroupsTaggingAPIClient,
      {
        args: [accountId, 'us-east-1'],
        metadata: { package: '@octo' },
      },
    );

    const response = await resourceGroupsTaggingApiClient.send(
      new GetResourcesCommand({
        TagFilters: [
          { Key: 'e2e-test', Values: ['true'] },
          { Key: 'e2e-test-family', Values: ['aws-s3-website'] },
        ],
      }),
    );

    expect(response.ResourceTagMappingList!.map((r) => r.ResourceARN)).toEqual([]);
  }, 60_000);
});
