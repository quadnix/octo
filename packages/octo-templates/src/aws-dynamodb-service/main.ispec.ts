import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import {
  type App,
  type ResourceSerializedOutput,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-localstack-account';
import type { AwsDynamoDBServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-service';
import axios from 'axios';
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import { AccountRepository } from './account.repository.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_STACK_URL: string = 'http://localhost:4566';

jest.setTimeout(30_000);

describe('Main IT', () => {
  let accountRepositoryUsEast1: AccountRepository;

  let environment: StartedDockerComposeEnvironment;
  let tableName: string;

  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let testModuleContainer: TestModuleContainer;

  beforeAll(async () => {
    environment = await new DockerComposeEnvironment(__dirname, 'docker-compose.yml')
      .withWaitStrategy('localstack-aws-dynamodb-service', Wait.forLogMessage('Ready.'))
      .up();

    stateProvider = new TestStateProvider();

    accountRepositoryUsEast1 = new AccountRepository('us-east-1', LOCAL_STACK_URL);
  });

  beforeEach(async () => {
    moduleDefinitions = new ModuleDefinitions();
    // Replace real aws credentials with localstack.
    moduleDefinitions.update(AwsLocalstackAccountModule, 'account-module', {
      app: stub<App>('${{app-module.model.app}}'),
    });

    await TestContainer.create(
      { mocks: [{ type: ModuleDefinitions, value: moduleDefinitions }] },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(stateProvider);

    const { moduleInputs } = moduleDefinitions.get<AwsDynamoDBServiceModule>('dynamodb-service-module')!;
    tableName = moduleInputs.TableName;
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  afterAll(async () => {
    if (environment) {
      await environment.down({ removeVolumes: true, timeout: 10_000 });
    }
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

    const resourcesActualState = await stateProvider.getState('resources-actual.json');
    const resourcesActual: { data: ResourceSerializedOutput } = JSON.parse(resourcesActualState.toString('utf-8'));

    // DynamoDB exists.
    expect(resourcesActual.data.resources[`@octo/dynamodb=dynamodb-${tableName}`]).toMatchInlineSnapshot(
      {
        resource: {
          response: {
            LatestStreamArn: expect.any(String),
            TableId: expect.any(String),
          },
        },
      },
      `
     {
       "className": "@octo/DynamoDB",
       "resource": {
         "parents": [],
         "properties": {
           "AttributeDefinitions": [
             {
               "AttributeName": "AccountId",
               "AttributeType": "S",
             },
             {
               "AttributeName": "AccountType",
               "AttributeType": "S",
             },
             {
               "AttributeName": "CreatedAt",
               "AttributeType": "N",
             },
             {
               "AttributeName": "UserId",
               "AttributeType": "S",
             },
           ],
           "DeletionProtectionEnabled": false,
           "GlobalSecondaryIndexes": [
             {
               "IndexName": "AccountUserIndex",
               "KeySchema": [
                 {
                   "AttributeName": "UserId",
                   "KeyType": "HASH",
                 },
               ],
               "Projection": {
                 "ProjectionType": "ALL",
               },
             },
           ],
           "KeySchema": [
             {
               "AttributeName": "AccountId",
               "KeyType": "HASH",
             },
             {
               "AttributeName": "AccountType",
               "KeyType": "RANGE",
             },
           ],
           "LocalSecondaryIndexes": [
             {
               "IndexName": "AccountCreatedAtIndex",
               "KeySchema": [
                 {
                   "AttributeName": "AccountId",
                   "KeyType": "HASH",
                 },
                 {
                   "AttributeName": "CreatedAt",
                   "KeyType": "RANGE",
                 },
               ],
               "Projection": {
                 "ProjectionType": "ALL",
               },
             },
           ],
           "StreamSpecification": {
             "StreamViewType": "NEW_AND_OLD_IMAGES",
           },
           "TableClass": "STANDARD",
           "TableName": "accounts",
           "awsAccountId": "000000000000",
           "awsRegionId": "us-east-1",
           "billingMode": {
             "settings": {
               "ProvisionedThroughput": {
                 "ReadCapacityUnits": 5,
                 "WriteCapacityUnits": 5,
               },
             },
             "type": "PROVISIONED",
           },
           "timeToLiveAttribute": "ExpiresAt",
         },
         "resourceId": "dynamodb-accounts",
         "response": {
           "LatestStreamArn": Any<String>,
           "TableArn": "arn:aws:dynamodb:us-east-1:000000000000:table/accounts",
           "TableId": Any<String>,
         },
         "tags": {},
       },
     }
    `,
    );
  });

  it('should CRUD DynamoDB table', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepositoryUsEast1.put({
      AccountId: '1',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 10,
      UserId: 'test-user-1',
    });

    // Can fetch by HASH key.
    const accountsByHash = await accountRepositoryUsEast1.getByAccountId('1');
    expect(accountsByHash.length).toBe(1);

    // Can fetch by HASH and RANGE key.
    const accountsByHashAndRange = await accountRepositoryUsEast1.getByAccountIdAndType('1', 'test');
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
      '1',
      createdAt - 10,
      createdAt + 10,
    );
    expect(accountsByLSI.length).toBe(1);

    await accountRepositoryUsEast1.update('1', 'test', { Email: 'test-user-1-updated@test.com' });
    const accountsAfterEmailUpdate = await accountRepositoryUsEast1.getByAccountId('1');
    expect(accountsAfterEmailUpdate[0].Email).toBe('test-user-1-updated@test.com');

    await accountRepositoryUsEast1.delete('1', 'test');
    const accountsAfterDelete = await accountRepositoryUsEast1.getByAccountId('1');
    expect(accountsAfterDelete.length).toBe(0);
  });

  it('should auto expire records from DynamoDB table', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepositoryUsEast1.put({
      AccountId: '1',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 5,
      UserId: 'test-user-1',
    });

    const accountsBeforeAutoExpire = await accountRepositoryUsEast1.getByAccountId('1');
    expect(accountsBeforeAutoExpire.length).toBe(1);

    // Wait > 5 seconds for auto expire.
    await new Promise((resolve) => setTimeout(resolve, 6000));
    // Force LocalStack to expire items.
    await axios.delete(`${LOCAL_STACK_URL}/_aws/dynamodb/expired`);

    const accountsAfterAutoExpire = await accountRepositoryUsEast1.getByAccountId('1');
    expect(accountsAfterAutoExpire.length).toBe(0);
  }, 10_000);

  it('should add GSI in DynamoDB table and query and delete GSI', async () => {
    // Add GSI - Email.
    const { moduleInputs } = moduleDefinitions.get<AwsDynamoDBServiceModule>('dynamodb-service-module')!;
    moduleInputs.AttributeDefinitions.push({ AttributeName: 'Email', AttributeType: 'S' });
    moduleInputs.GlobalSecondaryIndexes!.push({
      IndexName: 'AccountEmailIndex',
      KeySchema: [{ AttributeName: 'Email', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    });
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app1 } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    await testModuleContainer.commit(app1);

    // Query GSI - Email.
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepositoryUsEast1.put({
      AccountId: '1',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 5,
      UserId: 'test-user-1',
    });
    const accountsByEmail = await accountRepositoryUsEast1.getByEmail('test-user-1@test.com');
    expect(accountsByEmail.length).toBe(1);

    // Remove GSI - Email.
    moduleInputs.AttributeDefinitions.splice(4, 1);
    moduleInputs.GlobalSecondaryIndexes!.splice(1, 1);
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app2 } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    await testModuleContainer.commit(app2);

    // Cannot fetch by GSI index - Email, since the Email index has been removed.
    await expect(async () => {
      await accountRepositoryUsEast1.getByEmail('test-user-1@test.com');
    }).rejects.toThrow();
  });

  it('should delete DynamoDB resource', async () => {
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

    const { resourceTransaction } = await testModuleContainer.commit(app);
    expect(resourceTransaction).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/dynamodb=dynamodb-accounts",
           "value": "@octo/dynamodb=dynamodb-accounts",
         },
       ],
     ]
    `);

    const resourcesActualState = await stateProvider.getState('resources-actual.json');
    const resourcesActual: { data: ResourceSerializedOutput } = JSON.parse(resourcesActualState.toString('utf-8'));

    // DynamoDB deleted.
    expect(resourcesActual.data.resources[`@octo/dynamodb=dynamodb-${tableName}`]).toBeUndefined();
  });
});
