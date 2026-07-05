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
    const runModulesGenerator = testModuleContainer.runModules<AwsDynamoDBServiceModule>(
      app,
      {
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
      },
      { filterByModuleIds: ['dynamodb-module'], skipTerraformApply: true },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
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
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # dynamodb-module/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appCreate,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer);
    const noChange = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appNoChange,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(noChange.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(noChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appDelete,
          {
            hidden: true,
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
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
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appCreate,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/dynamodb=dynamodb-test-table",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appUpdateTags,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb=dynamodb-test-table",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appDeleteTags,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb=dynamodb-test-table",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle billingMode change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appCreate,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateBillingProvisionedThroughput } = await setup(testModuleContainer);
      const updateBillingProvisionedThroughput = (
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appUpdateBillingProvisionedThroughput,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(updateBillingProvisionedThroughput.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(updateBillingProvisionedThroughput.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
       ]
      `);

      const { app: appUpdateBillingPayPerRequest } = await setup(testModuleContainer);
      const updateBillingPayPerRequest = (
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appUpdateBillingPayPerRequest,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(updateBillingPayPerRequest.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(updateBillingPayPerRequest.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
       ]
      `);
    });

    describe('should handle GlobalSecondaryIndexes change', () => {
      it('should create table with GSI', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        const { hclRender, resourceDiffs } = (
          await testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appCreate,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next()
        ).value!;
        expect(hclRender).toMatchSnapshot();
        expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
         [
           "+ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
      });

      it('should add a GSI to an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appCreate,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next();

        const { app: appAddGSI } = await setup(testModuleContainer);
        const addGSI = (
          await testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appAddGSI,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next()
        ).value!;
        expect(addGSI.hclDiff).toMatchSnapshot();
        expect(testModuleContainer.digestDiffs(addGSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "* @octo/dynamodb=dynamodb-test-table",
         ]
        `);
      });

      it('should throw error updating a GSI in an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appCreate,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next();

        const { app: appUpdateGSIWithoutUpdatingIndex } = await setup(testModuleContainer);
        await expect(
          testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appUpdateGSIWithoutUpdatingIndex,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next(),
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot update DynamoDB GSIs immutable properties once it has been created!"`,
        );
      });

      it('should replace a GSI in an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appCreate,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next();

        const { app: appUpdateGSI } = await setup(testModuleContainer);
        const updateGSI = (
          await testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appUpdateGSI,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next()
        ).value!;
        expect(updateGSI.hclDiff).toMatchSnapshot();
        expect(testModuleContainer.digestDiffs(updateGSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "* @octo/dynamodb=dynamodb-test-table",
         ]
        `);
      });

      it('should delete a GSI from an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appCreate,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next();

        const { app: appRemoveGSI } = await setup(testModuleContainer);
        const removeGSI = (
          await testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appRemoveGSI,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next()
        ).value!;
        expect(removeGSI.hclDiff).toMatchSnapshot();
        expect(testModuleContainer.digestDiffs(removeGSI.resourceDiffs)).toMatchInlineSnapshot(`
         [
           "* @octo/dynamodb=dynamodb-test-table",
         ]
        `);
      });
    });

    describe('should handle LocalSecondaryIndexes change', () => {
      it('should create table with LSI', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        const { hclRender, resourceDiffs } = (
          await testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appCreate,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next()
        ).value!;
        expect(hclRender).toMatchSnapshot();
        expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
         [
           "+ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
      });

      it('should throw error updating a LSI on an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appCreate,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next();

        const { app: appUpdateLSI } = await setup(testModuleContainer);
        // local_secondary_index is force-new on aws_dynamodb_table → octo emits a REPLACE.
        const { resourceDiffs } = (
          await testModuleContainer
            .runModules<AwsDynamoDBServiceModule>(
              appUpdateLSI,
              {
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
              },
              { skipTerraformApply: true },
            )
            .next()
        ).value!;
        expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
         [
           "^ @octo/dynamodb=dynamodb-test-table",
         ]
        `);
      });
    });

    it('should handle StreamSpecification change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appCreate,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appAddStream } = await setup(testModuleContainer);
      const addStream = (
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appAddStream,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(addStream.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(addStream.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
       ]
      `);

      const { app: appRemoveStream } = await setup(testModuleContainer);
      const removeStream = (
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appRemoveStream,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(removeStream.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(removeStream.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
       ]
      `);
    });

    it('should handle timeToLiveAttribute change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appCreate,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appAddTTL } = await setup(testModuleContainer);
      const addTTL = (
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appAddTTL,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(addTTL.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(addTTL.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
       ]
      `);

      const { app: appRemoveTTL } = await setup(testModuleContainer);
      const removeTTL = (
        await testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            appRemoveTTL,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(removeTTL.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(removeTTL.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb=dynamodb-test-table",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsDynamoDBServiceModule>(
        appCreate,
        {
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
        },
        { skipTerraformApply: true },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsDynamoDBServiceModule>(
          appUpdateModuleId,
          {
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
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate TableName', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            app,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "TableName" in schema could not be validated!"`);
    });

    it('should validate AttributeType', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBServiceModule>(
            app,
            {
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
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "AttributeDefinitions" in schema could not be validated!"`,
      );
    });
  });
});
