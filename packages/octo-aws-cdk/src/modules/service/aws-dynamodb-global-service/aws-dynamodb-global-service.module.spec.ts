import {
  type Dependency,
  type DiffMetadata,
  Service,
  ServiceType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { DynamoDBSchema } from '../../../resources/dynamodb/index.schema.js';
import { AwsDynamoDBGlobalServiceModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    account: [account],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
  });

  const {
    region: [region1],
  } = await testModuleContainer.createTestModels('testRegion1Module', {
    account: [account],
    region: ['region-1'],
  });
  const {
    region: [region2],
  } = await testModuleContainer.createTestModels('testRegion2Module', {
    account: [account],
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

  const {
    region: [region3],
  } = await testModuleContainer.createTestModels('testRegion3Module', {
    account: [account],
    region: ['region-3'],
  });
  region3.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['eu-west-1a'],
        awsRegionId: 'eu-west-1',
        regionId: 'aws-eu-west-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region3,
    ),
  );

  const {
    region: [region4],
  } = await testModuleContainer.createTestModels('testRegion4Module', {
    account: [account],
    region: ['region-4'],
  });
  region4.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-west-2b'],
        awsRegionId: 'us-west-2',
        regionId: 'aws-us-west-2b',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region4,
    ),
  );

  const {
    region: [region5],
  } = await testModuleContainer.createTestModels('testRegion5Module', {
    account: [account],
    region: ['region-5'],
  });
  region5.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1b'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1b',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region5,
    ),
  );

  const {
    service: [service],
  } = await testModuleContainer.createTestModels('testModule', {
    service: [new Service('test-table-dynamodb', [region1], ServiceType.DATABASE, 'dynamodb')],
  });
  service.addAnchor(
    testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
      'AwsDynamoDBAnchor',
      {
        awsAccountId: '123',
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
    testModuleContainer.registerTerraformProvider('aws', '123', 'eu-west-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsDynamoDBGlobalServiceModule>(
      {
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { key1: 'value1' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      },
      { filterByModuleIds: ['global-dynamodb-module'], terraformTarget: 'skip' },
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
       alias = "_123-us-west-2"
       region = "us-west-2"
       allowed_account_ids = ["123"]
     }

     resource "aws_dynamodb_table_replica" "dynamodb-global-test-table-2dc6ed_us-west-2" {
       global_table_arn = var.dynamodb_test_table_TableArn
       provider = aws._123-us-west-2
       tags = {
         key1 = "value1"
       }
     }

     # global-dynamodb-module/outputs.tf
     output "dynamodb-global-test-table-2dc6ed-123_us-west-2_TableArn" {
       value = aws_dynamodb_table_replica.dynamodb-global-test-table-2dc6ed_us-west-2.arn
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
       mock_outputs_merge_strategy_with_state = "shallow"
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
         "AddAwsDynamoDBGlobalServiceReplicaRegionModelAction",
       ],
       [
         "AddAwsDynamoDBGlobalServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);

    await setup(testModuleContainer);
    const noChange = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(noChange.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(noChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    await setup(testModuleContainer);
    const addReplica = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [
                { region: stub('${{testRegion2Module.model.region}}'), tags: { key1: 'value1' } },
                { region: stub('${{testRegion3Module.model.region}}'), tags: {} },
              ],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(addReplica.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addReplica.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);

    await setup(testModuleContainer);
    const removeReplica = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(removeReplica.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(removeReplica.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);

    await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            hidden: true,
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { key1: 'value1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}') }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [
                { region: stub('${{testRegion2Module.model.region}}'), tags: { tag1: 'value1_1', tag2: 'value2_1' } },
              ],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);

    await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: {} }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle replica add', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: {} }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const addReplica = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [
                  { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
                  { region: stub('${{testRegion3Module.model.region}}'), tags: { env: 'replica2' } },
                ],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(addReplica.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(addReplica.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
       ]
      `);

      const globalService = addReplica.modelTransaction
        .flat()
        .find((d: DiffMetadata) => d.node.getContext().startsWith('service=test-table-global-dynamodb'))!.node;
      expect(globalService.getContext()).toMatchInlineSnapshot(
        `"service=test-table-global-dynamodb,service=test-table-dynamodb,region=region-1,account=123,app=test-app"`,
      );
      expect(
        Object.values(globalService.getSiblings())
          .flat()
          .map((d: Dependency) => d.to.getContext()),
      ).toMatchInlineSnapshot(`
       [
         "region=region-2,account=123,app=test-app",
         "region=region-3,account=123,app=test-app",
       ]
      `);
    });

    it('should handle replica delete', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [
                { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
                { region: stub('${{testRegion3Module.model.region}}'), tags: {} },
              ],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const removeReplica = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: {} }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(removeReplica.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(removeReplica.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
       ]
      `);
    });

    it('should handle replica tags update', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { a: '1' } }],
            },
            moduleId: 'global-dynamodb-module',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const updateReplicaTags = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { a: '2', b: '3' } }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(updateReplicaTags.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(updateReplicaTags.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/dynamodb-global=dynamodb-global-test-table-2dc6ed",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsDynamoDBGlobalServiceModule>(
        {
          inputs: {
            dynamoDBService: stub('${{testModule.model.service}}'),
            replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: {} }],
          },
          moduleId: 'global-dynamodb-module-1',
          type: AwsDynamoDBGlobalServiceModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsDynamoDBGlobalServiceModule>(
          {
            inputs: {
              dynamoDBService: stub('${{testModule.model.service}}'),
              replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: {} }],
            },
            moduleId: 'global-dynamodb-module-2',
            type: AwsDynamoDBGlobalServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('replica regions', () => {
    it('should create one replica for regions in the same AWS region', async () => {
      await setup(testModuleContainer);
      const result = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [
                  { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
                  { region: stub('${{testRegion4Module.model.region}}'), tags: {} },
                ],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      const globalService = result.modelTransaction
        .flat()
        .find((d: DiffMetadata) => d.node.getContext().startsWith('service=test-table-global-dynamodb'))!.node;
      expect(
        Object.values(globalService.getSiblings())
          .flat()
          .map((d: Dependency) => d.to.getContext()),
      ).toMatchInlineSnapshot(`
       [
         "region=region-2,account=123,app=test-app",
         "region=region-4,account=123,app=test-app",
       ]
      `);
      expect(result.hclRender.match(/resource "aws_dynamodb_table_replica" "[^"]+"/g)).toMatchInlineSnapshot(`
       [
         "resource "aws_dynamodb_table_replica" "dynamodb-global-test-table-2dc6ed_us-west-2"",
       ]
      `);
    });

    it("should create no replica for a region in the table's AWS region", async () => {
      await setup(testModuleContainer);
      const result = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [
                  { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
                  { region: stub('${{testRegion5Module.model.region}}'), tags: {} },
                ],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      const globalService = result.modelTransaction
        .flat()
        .find((d: DiffMetadata) => d.node.getContext().startsWith('service=test-table-global-dynamodb'))!.node;
      expect(
        Object.values(globalService.getSiblings())
          .flat()
          .map((d: Dependency) => d.to.getContext()),
      ).toMatchInlineSnapshot(`
       [
         "region=region-2,account=123,app=test-app",
         "region=region-5,account=123,app=test-app",
       ]
      `);
      expect(result.hclRender.match(/resource "aws_dynamodb_table_replica" "[^"]+"/g)).toMatchInlineSnapshot(`
       [
         "resource "aws_dynamodb_table_replica" "dynamodb-global-test-table-2dc6ed_us-west-2"",
       ]
      `);
    });

    it("should create no global table when every region is in the table's AWS region", async () => {
      await setup(testModuleContainer);
      const result = (
        await testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion5Module.model.region}}'), tags: {} }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('validation', () => {
    it('should validate a replica region is not the region the table sits in', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Replica region "region-1" is the region the table sits in!"`);
    });

    it('should validate replicas in one AWS region have the same tags', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [
                  { region: stub('${{testRegion2Module.model.region}}'), tags: { a: '1' } },
                  { region: stub('${{testRegion4Module.model.region}}'), tags: { a: '2' } },
                ],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Replicas in AWS region "us-west-2" share one table, so they must have the same tags!"`,
      );
    });

    it('should validate replicas is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "replicas" in schema could not be validated!"`);
    });

    it('should validate replica tag keys and values are non-empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsDynamoDBGlobalServiceModule>(
            {
              inputs: {
                dynamoDBService: stub('${{testModule.model.service}}'),
                replicas: [{ region: stub('${{testRegion2Module.model.region}}'), tags: { '': 'value1' } }],
              },
              moduleId: 'global-dynamodb-module',
              type: AwsDynamoDBGlobalServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "replicas" in schema could not be validated!"`);
    });
  });
});
