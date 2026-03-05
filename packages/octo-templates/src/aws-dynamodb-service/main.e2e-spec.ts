import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { jest } from '@jest/globals';
import { type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import type { AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import type { AwsDynamoDBServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-service';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { mockClient } from 'aws-sdk-client-mock';
import { AccountRepository } from './account.repository.js';
import { ModuleDefinitions } from './module-definitions.js';

jest.setTimeout(60_000);

describe('Main E2E', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;
  const stateProvider = new TestStateProvider();

  const accountRepositoryUsEast1 = new AccountRepository('us-east-1');
  const STSClientMock = mockClient(STSClient);

  const moduleDefinitions = new ModuleDefinitions();
  const accountId = moduleDefinitions.get<AwsIniAccountModule>('account-module')!.moduleInputs.accountId;

  beforeEach(async () => {
    STSClientMock.on(GetCallerIdentityCommand).resolves({ Account: accountId });

    container = await TestContainer.create({
      mocks: [
        {
          metadata: { package: '@octo' },
          type: STSClient,
          value: STSClientMock,
        },
      ],
    });

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(stateProvider, [
      { type: HtmlReportEventListener },
      { type: LoggingEventListener },
    ]);

    // Register tags on all resources.
    testModuleContainer.octo.registerTags([
      { scope: {}, tags: { 'e2e-test': 'true', 'e2e-test-family': 'aws-dynamodb-service' } },
    ]);
  });

  afterEach(async () => {
    STSClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should create base resources', async () => {
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );

    const { resourceTransaction } = await testModuleContainer.commit(app);
    expect(resourceTransaction).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/dynamodb=dynamodb-accounts",
           "value": "@octo/dynamodb=dynamodb-accounts",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-app-region-east",
           "value": "@octo/vpc=vpc-app-region-east",
         },
       ],
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-app-region-east",
           "value": "@octo/internet-gateway=igw-app-region-east",
         },
       ],
     ]
    `);
  });

  it('should CRUD DynamoDB table', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepositoryUsEast1.put({
      AccountId: 'TestCRUD',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 10,
      UserId: 'test-user-1',
    });

    // Can fetch by HASH key.
    const accountsByHash = await accountRepositoryUsEast1.getByAccountId('TestCRUD');
    expect(accountsByHash.length).toBe(1);

    // Can fetch by HASH and RANGE key.
    const accountsByHashAndRange = await accountRepositoryUsEast1.getByAccountIdAndType('TestCRUD', 'test');
    expect(accountsByHashAndRange).toBeDefined();

    // Cannot fetch by GSI index - Email, since the Email index has not been created.
    await expect(async () => {
      await accountRepositoryUsEast1.getByEmail('test-user-1@test.com');
    }).rejects.toThrow();

    // Can fetch by GSI index - UserId.
    const accountsByUserIdGSI = await accountRepositoryUsEast1.getByUserId('test-user-1');
    expect(accountsByUserIdGSI.length).toBe(1);

    // Can fetch by LSI index.
    const accountsByLSI = await accountRepositoryUsEast1.getByAccountIdAndCreatedAt(
      'TestCRUD',
      createdAt - 10,
      createdAt + 10,
    );
    expect(accountsByLSI.length).toBe(1);

    await accountRepositoryUsEast1.update('TestCRUD', 'test', { Email: 'test-user-1-updated@test.com' });
    const accountsAfterEmailUpdate = await accountRepositoryUsEast1.getByAccountId('TestCRUD');
    expect(accountsAfterEmailUpdate[0].Email).toBe('test-user-1-updated@test.com');

    await accountRepositoryUsEast1.delete('TestCRUD', 'test');
    const accountsAfterDelete = await accountRepositoryUsEast1.getByAccountId('TestCRUD');
    expect(accountsAfterDelete.length).toBe(0);
  });

  it('should auto expire records from DynamoDB table', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepositoryUsEast1.put({
      AccountId: 'TestAutoExpire',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 5,
      UserId: 'test-user-1',
    });

    const accountsBeforeAutoExpire = await accountRepositoryUsEast1.getByAccountId('TestAutoExpire');
    expect(accountsBeforeAutoExpire.length).toBe(1);

    // Wait > 5 seconds for auto expire.
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const accountsAfterAutoExpire = await accountRepositoryUsEast1.getByAccountId('TestAutoExpire');
    expect(accountsAfterAutoExpire.length).toBe(0);
  });

  it('should add GSI in DynamoDB table and query', async () => {
    // Add GSI - Email.
    const { moduleInputs } = moduleDefinitions.get<AwsDynamoDBServiceModule>('dynamodb-service-module')!;
    moduleInputs.AttributeDefinitions.push({ AttributeName: 'Email', AttributeType: 'S' });
    moduleInputs.GlobalSecondaryIndexes!.push({
      IndexName: 'AccountEmailIndex',
      KeySchema: [{ AttributeName: 'Email', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    });
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

    // Query GSI - Email.
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepositoryUsEast1.put({
      AccountId: 'TestAddGSI',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 5,
      UserId: 'test-user-1',
    });
    const accountsByEmail = await accountRepositoryUsEast1.getByEmail('test-user-1@test.com');
    expect(accountsByEmail.length).toBe(1);
  });

  it('should remove GSI in DynamoDB table and query', async () => {
    // Remove GSI - Email. Not adding Email GSI is equivalent to have removed it from module inputs.
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

    // Cannot fetch by GSI index - Email, since the Email index has been removed.
    await expect(async () => {
      await accountRepositoryUsEast1.getByEmail('test-user-1@test.com');
    }).rejects.toThrow();
  });

  it('should have no resources left after teardown', async () => {
    moduleDefinitions.remove('dynamodb-service-module');
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
          { Key: 'e2e-test-family', Values: ['aws-dynamodb-service'] },
        ],
      }),
    );

    expect(response.ResourceTagMappingList!.map((r) => r.ResourceARN)).toEqual([]);
  });
});
