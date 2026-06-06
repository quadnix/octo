import { type Account, type App, DiffAssert, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import type { DynamoDBSchema } from '../../../resources/dynamodb/index.schema.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsDynamoDBGlobalServiceModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
  octoTerraform: OctoTerraform,
): Promise<{ account: Account; app: App }> {
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

  const { '@octo/dynamodb=dynamodb-test-table': dynamoDBResource } = await testModuleContainer.createTestResources<
    [DynamoDBSchema]
  >(
    'testModule',
    [
      {
        properties: {
          AttributeDefinitions: [],
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
        response: {
          TableArn: 'TableArn',
        },
      },
    ],
    {
      save: true,
    },
  );

  const dynamoDBOctoResource = octoTerraform.addOctoTerraformResource(dynamoDBResource);
  dynamoDBOctoResource.output({
    TableArn: octoTerraform.raw('aws_dynamodb_table.dynamodb-test-table.arn'),
  });

  return { account, app };
}

describe('AwsDynamoDBGlobalServiceModule UT', () => {
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
    octoTerraform.addTerraformProvider('123', 'us-west-2');

    hcl = new HclAssert(octoTerraform);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['global-dynamodb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBGlobalServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureDynamoDBGlobalResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
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

     provider "aws" {
       alias = "123-us-west-2"
       region = "us-west-2"
     }

     output "dynamodb-test-table-TableArn" {
       value = aws_dynamodb_table.dynamodb-test-table.arn
     }

     resource "aws_dynamodb_table_replica" "dynamodb-global-test-table_us-east-1" {
       global_table_arn = aws_dynamodb_table.dynamodb-test-table.arn
       provider = aws.123-us-east-1
       tags = {
         key1 = "value1"
       }
     }

     output "dynamodb-global-test-table-123:us-east-1:TableArn" {
       value = aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1.arn
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.dynamodb-global-test-table-123:us-east-1:TableArn | blocks: 0 | properties: 1",
       "+ output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
       "+ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1 | blocks: 1 | properties: 2",
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultNoChange = await testModuleContainer.commit(appNoChange, { enableResourceCapture: true });
    expect(new DiffAssert(resultNoChange.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

    const { app: appAddReplica } = await setup(testModuleContainer, octoTerraform);
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
    const resultAddReplica = await testModuleContainer.commit(appAddReplica, { enableResourceCapture: true });
    expect(new DiffAssert(resultAddReplica.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.dynamodb-global-test-table-123:us-west-2:TableArn | blocks: 0 | properties: 1",
       "+ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-west-2 | blocks: 0 | properties: 3",
     ]
    `);

    const { app: appRemoveReplica } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultRemoveReplica = await testModuleContainer.commit(appRemoveReplica, { enableResourceCapture: true });
    expect(new DiffAssert(resultRemoveReplica.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- output.dynamodb-global-test-table-123:us-west-2:TableArn | blocks: 0 | properties: 1",
       "- resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-west-2 | blocks: 0 | properties: 3",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer, octoTerraform);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- output.dynamodb-global-test-table-123:us-east-1:TableArn | blocks: 0 | properties: 1",
       "- resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1 | blocks: 1 | properties: 2",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}') }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.dynamodb-global-test-table-123:us-east-1:TableArn | blocks: 0 | properties: 1",
       "+ output.dynamodb-test-table-TableArn | blocks: 0 | properties: 1",
       "+ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1 | blocks: 0 | properties: 2",
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "~ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1 | blocks: 1 | properties: 0",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/dynamodb-global=dynamodb-global-test-table",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "~ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1 | blocks: 1 | properties: 0",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle replica add', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appAddReplica } = await setup(testModuleContainer, octoTerraform);
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
      const resultAddReplica = await testModuleContainer.commit(appAddReplica, { enableResourceCapture: true });
      expect(new DiffAssert(resultAddReplica.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "+ output.dynamodb-global-test-table-123:us-west-2:TableArn | blocks: 0 | properties: 1",
         "+ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-west-2 | blocks: 1 | properties: 3",
       ]
      `);
    });

    it('should handle replica delete', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appRemoveReplica } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      const resultRemoveReplica = await testModuleContainer.commit(appRemoveReplica, { enableResourceCapture: true });
      expect(new DiffAssert(resultRemoveReplica.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "- output.dynamodb-global-test-table-123:us-west-2:TableArn | blocks: 0 | properties: 1",
         "- resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-west-2 | blocks: 0 | properties: 3",
       ]
      `);
    });

    it('should handle replica tags update', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '1' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateReplicaTags } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '2', b: '3' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      const resultUpdateReplicaTags = await testModuleContainer.commit(appUpdateReplicaTags, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateReplicaTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/dynamodb-global=dynamodb-global-test-table",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "~ resource.aws_dynamodb_table_replica.dynamodb-global-test-table_us-east-1 | blocks: 1 | properties: 0",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module-1',
      type: AwsDynamoDBGlobalServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module-2',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate replicas is not empty', async () => {
      await setup(testModuleContainer, octoTerraform);
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
      await setup(testModuleContainer, octoTerraform);
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
