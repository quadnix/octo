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
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
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

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['global-dynamodb-module'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBGlobalServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.diffHcl(appNoChange)).toMatchSnapshot();
    const resultNoChange = await testModuleContainer.commit(appNoChange);
    expect(testModuleContainer.digestDiffs(resultNoChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appAddReplica } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [
          { region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } },
          { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
        ],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.diffHcl(appAddReplica)).toMatchSnapshot();
    const resultAddReplica = await testModuleContainer.commit(appAddReplica);
    expect(testModuleContainer.digestDiffs(resultAddReplica.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appRemoveReplica } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.diffHcl(appRemoveReplica)).toMatchSnapshot();
    const resultRemoveReplica = await testModuleContainer.commit(appRemoveReplica);
    expect(testModuleContainer.digestDiffs(resultRemoveReplica.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}') }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [
          { region: stub('${{testRegion1Module.model.region}}'), tags: { tag1: 'value1_1', tag2: 'value2_1' } },
        ],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle replica add', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appAddReplica } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [
            { region: stub('${{testRegion1Module.model.region}}'), tags: {} },
            { region: stub('${{testRegion2Module.model.region}}'), tags: { env: 'replica2' } },
          ],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      expect(await testModuleContainer.diffHcl(appAddReplica)).toMatchSnapshot();
      const resultAddReplica = await testModuleContainer.commit(appAddReplica);
      expect(testModuleContainer.digestDiffs(resultAddReplica.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
    });

    it('should handle replica delete', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [
            { region: stub('${{testRegion1Module.model.region}}'), tags: {} },
            { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
          ],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appRemoveReplica } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      expect(await testModuleContainer.diffHcl(appRemoveReplica)).toMatchSnapshot();
      const resultRemoveReplica = await testModuleContainer.commit(appRemoveReplica);
      expect(testModuleContainer.digestDiffs(resultRemoveReplica.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
    });

    it('should handle replica tags update', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '1' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateReplicaTags } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '2', b: '3' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateReplicaTags)).toMatchSnapshot();
      const resultUpdateReplicaTags = await testModuleContainer.commit(appUpdateReplicaTags);
      expect(testModuleContainer.digestDiffs(resultUpdateReplicaTags.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module-1',
      type: AwsDynamoDBGlobalServiceModule,
    });
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module-2',
      type: AwsDynamoDBGlobalServiceModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate replicas is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
          inputs: {
            dynamoDBService: stub('${{testModule.model.service}}'),
            replicas: [],
          },
          moduleId: 'global-dynamodb-module',
          type: AwsDynamoDBGlobalServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "replicas" in schema could not be validated!"`);
    });

    it('should validate replica tag keys and values are non-empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
          inputs: {
            dynamoDBService: stub('${{testModule.model.service}}'),
            replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { '': 'value1' } }],
          },
          moduleId: 'global-dynamodb-module',
          type: AwsDynamoDBGlobalServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "replicas" in schema could not be validated!"`);
    });
  });
});
