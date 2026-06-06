import {
  type Account,
  type App,
  DiffAssert,
  type Region,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsDynamoDBServiceModule } from './index.js';

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

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsDynamoDBServiceModule UT', () => {
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );
    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();
    octoTerraform.addTerraformProvider('123', 'us-east-1');

    hcl = new HclAssert(octoTerraform);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'dynamodb-module',
      type: AwsDynamoDBServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['dynamodb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureDynamoDBResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);
    expect(octoTerraform.render()).toMatchInlineSnapshot(`
     "terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source  = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_dynamodb_table" "dynamodb-test-table" {
       provider = aws.123-us-east-1
       attribute {
         name = "AccountId"
         type = "S"
       }
       billing_mode = "PROVISIONED"
       deletion_protection_enabled = false
       hash_key = "AccountId"
       name = "test-table"
       table_class = "STANDARD"
       read_capacity = 5
       write_capacity = 5
     }

     output "dynamodb-test-table-TableArn" {
       value = aws_dynamodb_table.dynamodb-test-table.arn
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
       "+ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 1 | properties: 8",
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultNoChange = await testModuleContainer.commit(appNoChange, { enableResourceCapture: true });
    expect(new DiffAssert(resultNoChange.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/dynamodb=dynamodb-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
       "- resource.aws_dynamodb_table.dynamodb-test-table | blocks: 1 | properties: 8",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
       "+ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 1 | properties: 8",
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb=dynamodb-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb=dynamodb-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle billingMode change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateBillingProvisionedThroughput } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 10, WriteCapacityUnits: 10 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultUpdateBillingProvisionedThroughput = await testModuleContainer.commit(
        appUpdateBillingProvisionedThroughput,
        { enableResourceCapture: true },
      );
      expect(new DiffAssert(resultUpdateBillingProvisionedThroughput.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb=dynamodb-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 0 | properties: 2",
       ]
      `);

      const { app: appUpdateBillingPayPerRequest } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { OnDemandThroughput: { MaxReadRequestUnits: 5, MaxWriteRequestUnits: 5 } },
            type: 'PAY_PER_REQUEST',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultUpdateBillingPayPerRequest = await testModuleContainer.commit(appUpdateBillingPayPerRequest, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateBillingPayPerRequest.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb=dynamodb-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 1 | properties: 3",
       ]
      `);
    });

    describe('should handle GlobalSecondaryIndexes change', () => {
      it('should create table with GSI', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
         [
           "+ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
        expect(hcl.digest()).toMatchInlineSnapshot(`
         [
           "+ output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
           "+ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 2 | properties: 10",
         ]
        `);
      });

      it('should add a GSI to an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        hcl.digest();

        const { app: appAddGSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultAddGSI = await testModuleContainer.commit(appAddGSI, { enableResourceCapture: true });
        expect(new DiffAssert(resultAddGSI.resourceDiffs).digest()).toMatchInlineSnapshot(`
         [
           "~ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
        expect(hcl.digest()).toMatchInlineSnapshot(`
         [
           "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 2 | properties: 0",
         ]
        `);
      });

      it('should throw error updating a GSI in an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        hcl.digest();

        const { app: appUpdateGSIWithoutUpdatingIndex } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'UserId', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'UserId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await expect(async () => {
          await testModuleContainer.commit(appUpdateGSIWithoutUpdatingIndex, {
            enableResourceCapture: true,
          });
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot update DynamoDB GSIs immutable properties once it has been created!"`,
        );
      });

      it('should replace a GSI in an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        hcl.digest();

        const { app: appUpdateGSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'UserId', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-user',
                KeySchema: [{ AttributeName: 'UserId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultUpdateGSI = await testModuleContainer.commit(appUpdateGSI, { enableResourceCapture: true });
        expect(new DiffAssert(resultUpdateGSI.resourceDiffs).digest()).toMatchInlineSnapshot(`
         [
           "~ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
        expect(hcl.digest()).toMatchInlineSnapshot(`
         [
           "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 2 | properties: 0",
         ]
        `);
      });

      it('should delete a GSI from an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        hcl.digest();

        const { app: appRemoveGSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultRemoveGSI = await testModuleContainer.commit(appRemoveGSI, { enableResourceCapture: true });
        expect(new DiffAssert(resultRemoveGSI.resourceDiffs).digest()).toMatchInlineSnapshot(`
         [
           "~ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
        expect(hcl.digest()).toMatchInlineSnapshot(`
         [
           "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 2 | properties: 0",
         ]
        `);
      });
    });

    describe('should handle LocalSecondaryIndexes change', () => {
      it('should create table with LSI', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'SortKey', AttributeType: 'S' },
              { AttributeName: 'created', AttributeType: 'N' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [
              { AttributeName: 'AccountId', KeyType: 'HASH' },
              { AttributeName: 'SortKey', KeyType: 'RANGE' },
            ],
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
         [
           "+ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
        expect(hcl.digest()).toMatchInlineSnapshot(`
         [
           "+ output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
           "+ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 2 | properties: 9",
         ]
        `);
      });

      it('should throw error updating a LSI on an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'SortKey', AttributeType: 'S' },
              { AttributeName: 'created', AttributeType: 'N' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [
              { AttributeName: 'AccountId', KeyType: 'HASH' },
              { AttributeName: 'SortKey', KeyType: 'RANGE' },
            ],
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        hcl.digest();

        const { app: appUpdateLSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'SortKey', AttributeType: 'S' },
              { AttributeName: 'created', AttributeType: 'N' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [
              { AttributeName: 'AccountId', KeyType: 'HASH' },
              { AttributeName: 'SortKey', KeyType: 'RANGE' },
            ],
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'KEYS_ONLY' },
              },
            ],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });

        await expect(
          testModuleContainer.commit(appUpdateLSI, { enableResourceCapture: true }),
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot update DynamoDB immutable properties once it has been created!"`,
        );
      });
    });

    it('should handle StreamSpecification change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appAddStream } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultAddStream = await testModuleContainer.commit(appAddStream, { enableResourceCapture: true });
      expect(new DiffAssert(resultAddStream.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb=dynamodb-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 0 | properties: 2",
       ]
      `);

      const { app: appRemoveStream } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultRemoveStream = await testModuleContainer.commit(appRemoveStream, { enableResourceCapture: true });
      expect(new DiffAssert(resultRemoveStream.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb=dynamodb-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 0 | properties: 2",
       ]
      `);
    });

    it('should handle timeToLiveAttribute change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appAddTTL } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
          timeToLiveAttribute: 'expiresAt',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultAddTTL = await testModuleContainer.commit(appAddTTL, { enableResourceCapture: true });
      expect(new DiffAssert(resultAddTTL.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb=dynamodb-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 1 | properties: 0",
       ]
      `);

      const { app: appRemoveTTL } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultRemoveTTL = await testModuleContainer.commit(appRemoveTTL, { enableResourceCapture: true });
      expect(new DiffAssert(resultRemoveTTL.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb=dynamodb-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table.dynamodb-test-table | blocks: 1 | properties: 0",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { OnDemandThroughput: { MaxReadRequestUnits: 5, MaxWriteRequestUnits: 5 } },
          type: 'PAY_PER_REQUEST',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service-1',
      type: AwsDynamoDBServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { OnDemandThroughput: { MaxReadRequestUnits: 5, MaxWriteRequestUnits: 5 } },
          type: 'PAY_PER_REQUEST',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service-2',
      type: AwsDynamoDBServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate TableName', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            TableName: 'tb',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "TableName" in schema could not be validated!"`);
    });

    it('should validate AttributeType', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'X' as any }],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "AttributeDefinitions" in schema could not be validated!"`,
      );
    });
  });
});
