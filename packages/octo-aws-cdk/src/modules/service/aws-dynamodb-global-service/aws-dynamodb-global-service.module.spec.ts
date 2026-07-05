import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { DynamoDBSchema } from '../../../resources/dynamodb/index.schema.js';
import { AwsDynamoDBGlobalServiceModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
    service: [service],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
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
        awsRegionId: 'us-east-1',
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
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
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
        terraform: true,
      },
    ],
    { save: true },
  );

  return { account, app };
}

describe('AwsDynamoDBGlobalServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsDynamoDBGlobalServiceModule>(
      app,
      {
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      },
      { filterByModuleIds: ['global-dynamodb-module'], skipTerraformApply: true },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
     "# global-dynamodb-module/main.tf
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

     resource "aws_dynamodb_table_replica" "dynamodb-global-test-table_us-east-1" {
       global_table_arn = var.dynamodb_test_table_TableArn
       provider = aws._123-us-east-1
       tags = {
         key1 = "value1"
       }
     }

     # global-dynamodb-module/outputs.tf
     output "dynamodb-global-test-table-123_us-east-1_TableArn" {
       value = aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1.arn
     }

     # global-dynamodb-module/terragrunt.hcl
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

     dependency "testModule" {
       config_path = "../testModule"

       mock_outputs = {
         "dynamodb-test-table-TableArn" = "mock-dynamodb-test-table-TableArn"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     inputs = {
       dynamodb_test_table_TableArn = dependency.testModule.outputs["dynamodb-test-table-TableArn"]
     }

     # global-dynamodb-module/variables.tf
     variable "dynamodb_test_table_TableArn" {}

     # testModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
     }

     # testModule/outputs.tf
     output "dynamodb-test-table-TableArn" {
       value = "TableArn"
     }

     # testModule/terragrunt.hcl
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

     # testModule/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBGlobalServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appCreate,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer);
    const noChange = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appNoChange,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(noChange.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(noChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appAddReplica } = await setup(testModuleContainer);
    const addReplica = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appAddReplica,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [
                { region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } },
                { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
              ],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(addReplica.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addReplica.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appRemoveReplica } = await setup(testModuleContainer);
    const removeReplica = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appRemoveReplica,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(removeReplica.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(removeReplica.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appDelete,
          {
            hidden: true,
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appCreate,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}') }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appUpdateTags,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [
                { region: stub('${{testRegion1Module.model.region}}'), tags: { tag1: 'value1_1', tag2: 'value2_1' } },
              ],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appDeleteTags,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle replica add', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appCreate,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appAddReplica } = await setup(testModuleContainer);
      const addReplica = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            appAddReplica,
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [
                  { region: stub('${{testRegion1Module.model.region}}'), tags: {} },
                  { region: stub('${{testRegion2Module.model.region}}'), tags: { env: 'replica2' } },
                ],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(addReplica.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(addReplica.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
    });

    it('should handle replica delete', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appCreate,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [
                { region: stub('${{testRegion1Module.model.region}}'), tags: {} },
                { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
              ],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appRemoveReplica } = await setup(testModuleContainer);
      const removeReplica = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            appRemoveReplica,
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(removeReplica.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(removeReplica.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
    });

    it('should handle replica tags update', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appCreate,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateReplicaTags } = await setup(testModuleContainer);
      const updateReplicaTags = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            appUpdateReplicaTags,
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '2', b: '3' } }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(updateReplicaTags.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(updateReplicaTags.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsDynamoDBGlobalServiceModule>(
        appCreate,
        {
          inputs: {
            dynamoDBService: stub('${{testModule.model.service}}'),
            replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
          },
          moduleId: 'global-dynamodb-module-1',
          type: AwsDynamoDBGlobalServiceModule,
        },
        { skipTerraformApply: true },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          appUpdateModuleId,
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
            },
            moduleId: 'global-dynamodb-module-2',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate replicas is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            app,
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "replicas" in schema could not be validated!"`);
    });

    it('should validate replica tag keys and values are non-empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            app,
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { '': 'value1' } }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "replicas" in schema could not be validated!"`);
    });
  });
});
