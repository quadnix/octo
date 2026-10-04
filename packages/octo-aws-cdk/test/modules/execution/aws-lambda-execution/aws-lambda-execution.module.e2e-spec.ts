import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsDeploymentAnchorSchema } from '../../../../src/anchors/aws-deployment/aws-deployment.anchor.schema.js';
import type { AwsDynamoDBAnchorSchema } from '../../../../src/anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsEcrImageAnchorSchema } from '../../../../src/anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import type { AwsServerlessEnvironmentAnchorSchema } from '../../../../src/anchors/aws-environment/aws-serverless-environment.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-serverless-region.anchor.schema.js';
import type { AwsServerAnchorSchema } from '../../../../src/anchors/aws-server/aws-server.anchor.schema.js';
import type { AwsServerlessSubnetAnchorSchema } from '../../../../src/anchors/aws-subnet/aws-serverless-subnet.anchor.schema.js';
import { AwsLambdaExecutionModule } from '../../../../src/modules/execution/aws-lambda-execution/index.js';
import { DynamoDB } from '../../../../src/resources/dynamodb/index.js';
import type { EcrImageTagSchema } from '../../../../src/resources/ecr-image-tag/index.schema.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

/**
 * A serverless region with an environment and a subnet, and a server whose deployment runs tag `0.0.1`
 * of a published image, as the serverless, server, deployment and image modules would have left them.
 * The server may read and write a table, so the plan covers the role's grants too.
 */
async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    app: [app],
    deployment: [deployment],
    environment: [environment],
    image: [image],
    region: [region],
    server: [server],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    deployment: ['v1'],
    environment: ['qa'],
    image: ['family/image'],
    region: ['region'],
    server: ['backend'],
    subnet: ['default'],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
      'AwsServerlessRegionAnchor',
      { awsRegionId: AWS_REGION_ID, regionId: 'region', serverless: true },
      region,
    ),
  );
  environment.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessEnvironmentAnchorSchema>(
      'AwsServerlessEnvironmentAnchor',
      { environmentName: 'qa', environmentVariables: { NODE_ENV: 'qa' }, serverless: true },
      environment,
    ),
  );
  subnet.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessSubnetAnchorSchema>(
      'AwsServerlessSubnetAnchor',
      { serverless: true, subnetName: 'default' },
      subnet,
    ),
  );

  const serverAnchor = testModuleContainer.createTestAnchor<AwsServerAnchorSchema>(
    'AwsServerAnchor',
    {
      grants: {
        dynamodb: [{ allowRead: true, allowWrite: true, awsRegionId: AWS_REGION_ID, tableName: 'accounts' }],
        s3: [],
      },
      serverKey: 'backend',
    },
    server,
  );
  server.addAnchor(serverAnchor);

  const deploymentAnchor = testModuleContainer.createTestAnchor<AwsDeploymentAnchorSchema>(
    'AwsDeploymentAnchor',
    {
      command: null,
      cpu: null,
      image: { imageId: 'family/image', imageTag: '0.0.1', kind: 'ecr' },
      memory: 512,
      ports: [{ containerPort: 8080, protocol: 'tcp' }],
      timeoutInSeconds: 30,
    },
    deployment,
  );
  deployment.addAnchor(deploymentAnchor);

  // Publish the image, and link the deployment to it.
  const imageAnchor = testModuleContainer.createTestAnchor<AwsEcrImageAnchorSchema>(
    'AwsEcrImageAnchor',
    { imageId: image.imageId },
    image,
  );
  image.addAnchor(imageAnchor);
  await testModuleContainer.createTestOverlays('imageTagModule', [
    {
      anchors: [imageAnchor],
      context: '@octo/aws-ecr-image-tag-overlay=aws-ecr-image-tag-overlay-family/image-0-0-1',
      properties: {
        architecture: 'arm64',
        dockerfileDirectory: 'images/backend',
        dockerfileName: 'Dockerfile',
        imageId: image.imageId,
        imageTag: '0.0.1',
      },
    },
  ]);
  await testModuleContainer.createTestResources<[EcrImageTagSchema]>(
    'imageTagModule',
    [
      {
        properties: {
          architecture: 'arm64',
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegionId: AWS_REGION_ID,
          dockerfileDirectory: 'images/backend',
          dockerfileName: 'Dockerfile',
          imageId: image.imageId,
          imageTag: '0.0.1',
        },
        resourceContext: `@octo/ecr-image-tag=ecr-image-tag-${AWS_REGION_ID}-family/image-0-0-1`,
        response: { imageUri: `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION_ID}.amazonaws.com/family/image:0.0.1` },
      },
    ],
    { save: true },
  );
  await testModuleContainer.createTestOverlays('testModule', [
    {
      anchors: [deploymentAnchor, imageAnchor],
      context: '@octo/aws-deployment-image-overlay=aws-deployment-image-overlay-v1',
      properties: { deploymentTag: 'v1', imageId: image.imageId, imageTag: '0.0.1', serverKey: 'backend' },
    },
  ]);

  // The table the server may reach.
  const {
    service: [table],
  } = await testModuleContainer.createTestModels('tableModule', {
    app: [app],
    service: [['accounts', { tableName: 'accounts' }]],
  });
  const tableAnchor = testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
    'AwsDynamoDBAnchor',
    { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: AWS_REGION_ID, TableName: 'accounts' },
    table,
  );
  table.addAnchor(tableAnchor);
  await testModuleContainer.createResources(
    'tableModule',
    [
      new DynamoDB('dynamodb-accounts', {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        awsAccountId: AWS_ACCOUNT_ID,
        awsRegionId: AWS_REGION_ID,
        billingMode: { settings: {}, type: 'PAY_PER_REQUEST' },
        DeletionProtectionEnabled: false,
        GlobalSecondaryIndexes: [],
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        LocalSecondaryIndexes: [],
        TableClass: 'STANDARD',
        TableName: 'accounts',
      }),
    ],
    { save: true },
  );
  await testModuleContainer.createTestOverlays('testModule', [
    {
      anchors: [serverAnchor, tableAnchor],
      context: '@octo/aws-server-dynamodb-access-overlay=aws-server-dynamodb-access-overlay-accounts',
      properties: {
        allowRead: true,
        allowWrite: true,
        awsRegionId: AWS_REGION_ID,
        serverKey: 'backend',
        tableName: 'accounts',
      },
    },
  ]);
}

describe('AwsLambdaExecutionModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '6.28', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate terragrunt that validates and plans against AWS', async () => {
    await setup(testModuleContainer);
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          {
            inputs: {
              deployment: stub('${{testModule.model.deployment}}'),
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-qa',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(Object.keys(HclUtility.parse(hclRender).resource)).toMatchInlineSnapshot(`
     [
       "aws_iam_role.iam-role-ExecutionRole-backend-v1-qa-c96758",
       "aws_iam_policy.iam-role-ExecutionRole-backend-v1-qa-c96758_ExecutionRole-backend-v1-qa-34c1aa0ceda0",
       "aws_iam_role_policy_attachment.iam-role-ExecutionRole-backend-v1-qa-c96758_ExecutionRole-backend-v1-qa-34c1aa0ceda0_attach",
       "aws_lambda_function.lambda-function-backend-v1-qa-c96758",
       "aws_lambda_function_url.lambda-function-backend-v1-qa-c96758_url",
       "null_resource.ecr-image-tag-us-east-1-family_image-0-0-1",
       "aws_dynamodb_table.dynamodb-accounts",
     ]
    `);
  }, 300_000);
});
