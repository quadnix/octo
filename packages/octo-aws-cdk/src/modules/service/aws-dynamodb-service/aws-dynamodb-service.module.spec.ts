import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
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
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
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
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
     "# dynamodb-module/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_dynamodb_table" "dynamodb-test-table" {
       provider = aws._123-us-east-1
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

     # dynamodb-module/outputs.tf
     output "dynamodb-test-table-TableArn" {
       value = aws_dynamodb_table.dynamodb-test-table.arn
     }

     # dynamodb-module/terragrunt.hcl
     <empty>

     # dynamodb-module/variables.tf
     <empty>"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['dynamodb-module'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
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
    expect(await testModuleContainer.diffHcl(appNoChange)).toMatchSnapshot();
    const resultNoChange = await testModuleContainer.commit(appNoChange);
    expect(testModuleContainer.digestDiffs(resultNoChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/dynamodb=dynamodb-test-table",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
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
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb=dynamodb-test-table",
     ]
    `);

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
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb=dynamodb-test-table",
     ]
    `);
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
      await testModuleContainer.commit(appCreate);

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
      expect(await testModuleContainer.diffHcl(appUpdateBillingProvisionedThroughput)).toMatchSnapshot();
      const resultUpdateBillingProvisionedThroughput = await testModuleContainer.commit(
        appUpdateBillingProvisionedThroughput,
      );
      expect(testModuleContainer.digestDiffs(resultUpdateBillingProvisionedThroughput.resourceDiffs))
        .toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
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
      expect(await testModuleContainer.diffHcl(appUpdateBillingPayPerRequest)).toMatchSnapshot();
      const resultUpdateBillingPayPerRequest = await testModuleContainer.commit(appUpdateBillingPayPerRequest);
      expect(testModuleContainer.digestDiffs(resultUpdateBillingPayPerRequest.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
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
        expect(await testModuleContainer.renderHcl(appCreate)).toMatchSnapshot();
        const resultCreate = await testModuleContainer.commit(appCreate);
        expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "+ @octo/dynamodb=dynamodb-test-table",
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
        await testModuleContainer.commit(appCreate);

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
        expect(await testModuleContainer.diffHcl(appAddGSI)).toMatchSnapshot();
        const resultAddGSI = await testModuleContainer.commit(appAddGSI);
        expect(testModuleContainer.digestDiffs(resultAddGSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "* @octo/dynamodb=dynamodb-test-table",
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
        await testModuleContainer.commit(appCreate);

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
          await testModuleContainer.commit(appUpdateGSIWithoutUpdatingIndex);
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

        await testModuleContainer.commit(appCreate);

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
        expect(await testModuleContainer.diffHcl(appUpdateGSI)).toMatchSnapshot();
        const resultUpdateGSI = await testModuleContainer.commit(appUpdateGSI);
        expect(testModuleContainer.digestDiffs(resultUpdateGSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "* @octo/dynamodb=dynamodb-test-table",
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
        await testModuleContainer.commit(appCreate);

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
        expect(await testModuleContainer.diffHcl(appRemoveGSI)).toMatchSnapshot();
        const resultRemoveGSI = await testModuleContainer.commit(appRemoveGSI);
        expect(testModuleContainer.digestDiffs(resultRemoveGSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "* @octo/dynamodb=dynamodb-test-table",
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
        expect(await testModuleContainer.renderHcl(appCreate)).toMatchSnapshot();
        const resultCreate = await testModuleContainer.commit(appCreate);
        expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "+ @octo/dynamodb=dynamodb-test-table",
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
        await testModuleContainer.commit(appCreate);

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

        // local_secondary_index is force-new on aws_dynamodb_table → octo emits a REPLACE.
        const resultUpdateLSI = await testModuleContainer.commit(appUpdateLSI);
        expect(testModuleContainer.digestDiffs(resultUpdateLSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "^ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
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
      await testModuleContainer.commit(appCreate);

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
      expect(await testModuleContainer.diffHcl(appAddStream)).toMatchSnapshot();
      const resultAddStream = await testModuleContainer.commit(appAddStream);
      expect(testModuleContainer.digestDiffs(resultAddStream.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
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
      expect(await testModuleContainer.diffHcl(appRemoveStream)).toMatchSnapshot();
      const resultRemoveStream = await testModuleContainer.commit(appRemoveStream);
      expect(testModuleContainer.digestDiffs(resultRemoveStream.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
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
      await testModuleContainer.commit(appCreate);

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
      expect(await testModuleContainer.diffHcl(appAddTTL)).toMatchSnapshot();
      const resultAddTTL = await testModuleContainer.commit(appAddTTL);
      expect(testModuleContainer.digestDiffs(resultAddTTL.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
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
      expect(await testModuleContainer.diffHcl(appRemoveTTL)).toMatchSnapshot();
      const resultRemoveTTL = await testModuleContainer.commit(appRemoveTTL);
      expect(testModuleContainer.digestDiffs(resultRemoveTTL.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
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
    await testModuleContainer.commit(appCreate);

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
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
