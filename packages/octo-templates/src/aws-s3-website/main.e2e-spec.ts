import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { type AModule, type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { type AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { type SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { type AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import axios from 'axios';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteSourcePath = join(__dirname, 'website');

describe('Main E2E', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  const moduleDefinitions = new ModuleDefinitions();
  const accountId = moduleDefinitions.get<AwsIniAccountModule>('account-module')!.moduleInputs.accountId;
  const bucketName =
    moduleDefinitions.get<AwsS3StaticWebsiteServiceModule>('s3-website-service-module')!.moduleInputs.bucketName;

  const stateProvider = new TestStateProvider();

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] });

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
