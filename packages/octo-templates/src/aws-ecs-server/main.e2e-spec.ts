import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import {
  type AModule,
  type AResource,
  type Container,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
} from '@quadnix/octo';
import { type AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { type SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import type { AlbSchema } from '@quadnix/octo-aws-cdk/resources/alb/schema';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { ModuleDefinitions } from './module-definitions.js';

describe('Main E2E', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  const moduleDefinitions = new ModuleDefinitions();
  const accountId = moduleDefinitions.get<AwsIniAccountModule>('account-module')!.moduleInputs.accountId;

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
      { scope: {}, tags: { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' } },
    ]);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should have server available', async () => {
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    const result = await testModuleContainer.commit(app);
    const albResource = result.resourceTransaction
      .flat()
      .find((t) => (t.node.constructor as typeof AResource).NODE_NAME === 'alb')!.node as AResource<AlbSchema, any>;
    const albDnsName = albResource.response.DNSName;

    const axiosClient = axios.create({ baseURL: `http://${albDnsName}` });
    // Retry for 3 minutes.
    axiosRetry(axiosClient, {
      retries: 18,
      retryCondition: (error) => error.response?.status !== 200,
      retryDelay: () => 10000,
    });
    const albResponse = await axiosClient.get(`/`);
    expect(albResponse.status).toBe(200);
  }, 300_000);

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
  }, 1_200_000);
});
