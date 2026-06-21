import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../../src/anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-region.anchor.schema.js';
import { AwsDynamoDBGlobalServiceModule } from '../../../../src/modules/service/aws-dynamodb-global-service/index.js';
import { DynamoDBSchema } from '../../../../src/resources/dynamodb/index.schema.js';
import { TerragruntRunner } from '../../../../src/utilities/terragrunt-runner/terragrunt-runner.utility.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
    service: [service],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    service: [['dynamodb-service', { tableName: 'test-table' }]],
  });

  const {
    region: [region1],
  } = await testModuleContainer.createTestModels('testRegion1Module', {
    account: [account],
    app: [app],
    region: ['region-1'],
  });
  const {
    region: [region2],
  } = await testModuleContainer.createTestModels('testRegion2Module', {
    account: [account],
    app: [app],
    region: ['region-2'],
  });

  region1.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: AWS_REGION_ID,
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region1,
    ),
  );
  region2.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-west-2a'],
        awsRegionId: 'us-west-2',
        regionId: 'aws-us-west-2a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region2,
    ),
  );

  service.addAnchor(
    testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
      'AwsDynamoDBAnchor',
      {
        TableName: 'test-table',
      },
      service,
    ),
  );

  await testModuleContainer.createTestResources<[DynamoDBSchema]>(
    'testModule',
    [
      {
        properties: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegionId: AWS_REGION_ID,
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          DeletionProtectionEnabled: false,
          GlobalSecondaryIndexes: [],
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          LocalSecondaryIndexes: [],
          TableClass: 'STANDARD',
          TableName: 'test-table',
        },
        resourceContext: '@octo/dynamodb=dynamodb-test-table',
        response: { TableArn: 'TableArn' },
        schema: DynamoDBSchema,
        terraform: true,
      },
    ],
    { save: true },
  );

  return { account, app };
}

describe('AwsDynamoDBGlobalServiceModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, 'us-west-2');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate terragrunt that validates and plans against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });

    const { outputDir } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    const runner = new TerragruntRunner(outputDir, { awsRegion: AWS_REGION_ID });
    await runner.validate();
    await runner.plan();
  }, 300_000);
});
