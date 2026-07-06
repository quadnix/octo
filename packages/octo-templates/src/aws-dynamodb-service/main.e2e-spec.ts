import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { type App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { type AwsDynamoDBServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-service';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { AccountRepository } from './account.repository.js';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const outputDir = join(__dirname, '.octo', 'generated');

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-dynamodb-service' };

jest.setTimeout(600_000);

describe('Main E2E', () => {
  let accountRepositoryUsEast1: AccountRepository;
  let app: App;
  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let tableName: string;
  let testModuleContainer: TestModuleContainer;

  beforeAll(() => {
    stateProvider = new TestStateProvider();
    accountRepositoryUsEast1 = new AccountRepository(AWS_REGION_ID);
  });

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(stateProvider);

    testModuleContainer.registerTerraformConfig({
      minTerraformVersion: '1.6.0',
      providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', config.AWS_ACCOUNT_ID, AWS_REGION_ID);

    // Register tags on all resources.
    testModuleContainer.registerTags([{ scope: {}, tags: E2E_TAGS }]);

    ({
      app: [app],
    } = await testModuleContainer.createTestModels('app-module', { app: ['aws-dynamodb-service'] }));

    moduleDefinitions = new ModuleDefinitions();
    // Replace real app with test app.
    moduleDefinitions.remove('app-module');

    const { moduleInputs } = moduleDefinitions.get<AwsDynamoDBServiceModule>('dynamodb-service-module')!;
    tableName = moduleInputs.TableName;
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should create base resources', async () => {
    const { responses } = (
      await testModuleContainer
        .runModules(
          app,
          moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
          { outputDir, terraformTarget: 'apply' },
        )
        .next()
    ).value!;

    expect(responses[`@octo/dynamodb=dynamodb-${tableName}`]).toMatchObject({
      TableArn: expect.stringContaining(`table/${tableName}`),
    });
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

  it('should add GSI in DynamoDB table and query', async () => {
    // Add GSI - Email.
    const { moduleInputs } = moduleDefinitions.get<AwsDynamoDBServiceModule>('dynamodb-service-module')!;
    moduleInputs.AttributeDefinitions.push({ AttributeName: 'Email', AttributeType: 'S' });
    moduleInputs.GlobalSecondaryIndexes!.push({
      IndexName: 'AccountEmailIndex',
      KeySchema: [{ AttributeName: 'Email', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    });

    await testModuleContainer
      .runModules(
        app,
        moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
        { outputDir, terraformTarget: 'apply' },
      )
      .next();

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
    await testModuleContainer
      .runModules(
        app,
        moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
        { outputDir, terraformTarget: 'apply' },
      )
      .next();

    // Cannot fetch by GSI index - Email, since the Email index has been removed.
    await expect(async () => {
      await accountRepositoryUsEast1.getByEmail('test-user-1@test.com');
    }).rejects.toThrow();
  });

  it('should have no resources left after teardown', async () => {
    moduleDefinitions.remove('dynamodb-service-module');
    moduleDefinitions.remove('region-module');

    await testModuleContainer
      .runModules(
        app,
        moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
        { outputDir, terraformTarget: 'apply' },
      )
      .next();

    const awsResourcesUtility = new AwsTagsUtility(AWS_REGION_ID);
    const leftoverArns = await awsResourcesUtility.getResourceArnsByTags(E2E_TAGS);
    expect(leftoverArns).toEqual([]);
  });
});
