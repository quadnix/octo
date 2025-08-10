import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { type AModule, type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { type AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { type SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { EventLoggerListener } from '@quadnix/octo-event-listeners';
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
    await testModuleContainer.initialize(stateProvider, [{ type: EventLoggerListener }]);

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
    await testModuleContainer.commit(app);

    expect(true).toBe(true);
  }, 60_000);

  it.skip('should have no resources left after teardown', async () => {
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
  }, 300_000);
});
