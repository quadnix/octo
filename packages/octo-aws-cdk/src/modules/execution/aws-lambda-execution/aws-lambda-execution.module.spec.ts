import { type ModuleSchemaInputs, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import type { AwsServerlessEnvironmentAnchorSchema } from '../../../anchors/aws-environment/aws-serverless-environment.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import type { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';
import type { AwsServerlessSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-serverless-subnet.anchor.schema.js';
import { DynamoDB } from '../../../resources/dynamodb/index.js';
import type { EcrImageTagSchema } from '../../../resources/ecr-image-tag/index.schema.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import { AwsLambdaExecutionModule } from './index.js';

type DeploymentProperties = AwsDeploymentAnchorSchema['properties'];

/**
 * A serverless region with an environment and a subnet, and a server whose deployment runs tag `0.0.1`
 * of a published image, as the serverless, server, deployment and image modules would have left them.
 *
 * `deployment` overrides what the deployment anchor holds. `publishedIn` is the region the tag is
 * published in. `withTableGrant` gives the server read-write access to a table `accounts` in each of
 * `tableRegions`, and `withBucketGrant` read access to a bucket prefix. `bucketAccount` and
 * `tableAccount` are the accounts those are created in.
 */
async function setup(
  testModuleContainer: TestModuleContainer,
  {
    bucketAccount = '123',
    deployment: deploymentOverrides = {},
    publishedFor = 'arm64',
    publishedIn = 'us-east-1',
    tableAccount = '123',
    tableRegions = ['us-east-1'],
    withBucketGrant = false,
    withTableGrant = false,
  }: {
    bucketAccount?: string;
    deployment?: Partial<DeploymentProperties>;
    publishedFor?: 'arm64' | 'x86_64';
    publishedIn?: string;
    tableAccount?: string;
    tableRegions?: string[];
    withBucketGrant?: boolean;
    withTableGrant?: boolean;
  } = {},
): Promise<void> {
  const {
    app: [app],
    deployment: [deployment],
    environment: [environment],
    image: [image],
    region: [region],
    server: [server],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
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
      { awsRegionId: 'us-east-1', regionId: 'region', serverless: true },
      region,
    ),
  );
  environment.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessEnvironmentAnchorSchema>(
      'AwsServerlessEnvironmentAnchor',
      { environmentName: 'qa', environmentVariables: { NODE_ENV: 'qa', SHARED: 'environment' }, serverless: true },
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
        dynamodb: withTableGrant
          ? tableRegions.map((awsRegionId) => ({
              allowRead: true,
              allowWrite: true,
              awsRegionId,
              tableName: 'accounts',
            }))
          : [],
        s3: withBucketGrant
          ? [{ accessPrefix: 'uploads', allowRead: true, allowWrite: false, bucketName: 'test-bucket' }]
          : [],
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
      ...deploymentOverrides,
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
        architecture: publishedFor,
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
          architecture: publishedFor,
          awsAccountId: '123',
          awsRegionId: publishedIn,
          dockerfileDirectory: 'images/backend',
          dockerfileName: 'Dockerfile',
          imageId: image.imageId,
          imageTag: '0.0.1',
        },
        resourceContext: `@octo/ecr-image-tag=ecr-image-tag-${publishedIn}-family/image-0-0-1`,
        response: { imageUri: `123.dkr.ecr.${publishedIn}.amazonaws.com/family/image:0.0.1` },
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

  if (withBucketGrant) {
    const {
      service: [bucket],
    } = await testModuleContainer.createTestModels('bucketModule', {
      app: [app],
      service: [['test-bucket', { bucketName: 'test-bucket' }]],
    });
    bucket.addAnchor(
      testModuleContainer.createTestAnchor<AwsS3StorageServiceAnchorSchema>(
        'AwsS3StorageServiceAnchor',
        { awsAccountId: bucketAccount, awsRegionId: 'us-east-1', bucketName: 'test-bucket', contentDigest: 'digest' },
        bucket,
      ),
    );
    const accessPrefixAnchor = testModuleContainer.createTestAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>(
      'AwsS3StorageServiceAccessPrefixAnchor-uploads',
      { accessPrefix: 'uploads', bucketName: 'test-bucket' },
      bucket,
    );
    bucket.addAnchor(accessPrefixAnchor);
    await testModuleContainer.createResources(
      'bucketModule',
      [
        new S3Storage('bucket-test-bucket', {
          awsAccountId: bucketAccount,
          awsRegionId: 'us-east-1',
          blockPublicAccess: true,
          Bucket: 'test-bucket',
          permissions: [],
        }),
      ],
      { save: true },
    );
    await testModuleContainer.createTestOverlays('testModule', [
      {
        anchors: [serverAnchor, accessPrefixAnchor],
        context: '@octo/aws-server-s3-access-overlay=aws-server-s3-access-overlay-uploads',
        properties: {
          accessPrefix: 'uploads',
          allowRead: true,
          allowWrite: false,
          bucketName: 'test-bucket',
          serverKey: 'backend',
        },
      },
    ]);
  }

  for (const [index, awsRegionId] of (withTableGrant ? tableRegions : []).entries()) {
    const tableModuleId = index === 0 ? 'tableModule' : `tableModule-${awsRegionId}`;
    const {
      service: [table],
    } = await testModuleContainer.createTestModels(tableModuleId, {
      app: [app],
      service: [[`accounts-${awsRegionId}`, { tableName: 'accounts' }]],
    });
    const tableAnchor = testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
      'AwsDynamoDBAnchor',
      { awsAccountId: tableAccount, awsRegionId, TableName: 'accounts' },
      table,
    );
    table.addAnchor(tableAnchor);
    await testModuleContainer.createResources(
      tableModuleId,
      [
        new DynamoDB(`dynamodb-accounts-${awsRegionId}`, {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          awsAccountId: tableAccount,
          awsRegionId,
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
        context: `@octo/aws-server-dynamodb-access-overlay=aws-server-dynamodb-access-overlay-accounts-${awsRegionId}`,
        properties: { allowRead: true, allowWrite: true, awsRegionId, serverKey: 'backend', tableName: 'accounts' },
      },
    ]);
  }
}

function executionInputs(
  overrides: Partial<ModuleSchemaInputs<AwsLambdaExecutionModule>> = {},
): ModuleSchemaInputs<AwsLambdaExecutionModule> {
  return {
    deployment: stub('${{testModule.model.deployment}}'),
    environment: stub('${{testModule.model.environment}}'),
    environmentVariables: { SHARED: 'execution' },
    executionId: 'backend-v1-qa',
    subnet: stub('${{testModule.model.subnet}}'),
    ...overrides,
  };
}

describe('AwsLambdaExecutionModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '6.28', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    await setup(testModuleContainer);
    const { hclRender, modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toMatchInlineSnapshot(`
     "# execution/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 6.28"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
       allowed_account_ids = ["123"]
     }

     resource "aws_iam_role" "iam-role-ExecutionRole-backend-v1-qa-83d832" {
       provider = aws._123-us-east-1
       assume_role_policy = jsonencode({
         Statement = [{
             Action = "sts:AssumeRole"
             Effect = "Allow"
             Principal = {
               Service = "lambda.amazonaws.com"
             }
           }]
         Version = "2012-10-17"
       })
       name = "ExecutionRole-backend-v1-qa"
     }

     resource "aws_lambda_function" "lambda-function-backend-v1-qa-83d832" {
       provider = aws._123-us-east-1
       architectures = ["arm64"]
       environment {
         variables = {
           NODE_ENV = "qa"
           SHARED = "execution"
           AWS_LWA_PORT = "8080"
         }
       }
       function_name = "backend-v1-qa"
       image_uri = var.ecr_image_tag_us_east_1_family_image_0_0_1.imageUri
       memory_size = 512
       package_type = "Image"
       role = aws_iam_role.iam-role-ExecutionRole-backend-v1-qa-83d832.arn
       timeout = 30
     }

     resource "aws_lambda_function_url" "lambda-function-backend-v1-qa-83d832_url" {
       provider = aws._123-us-east-1
       authorization_type = "AWS_IAM"
       function_name = aws_lambda_function.lambda-function-backend-v1-qa-83d832.function_name

       depends_on = [aws_lambda_function.lambda-function-backend-v1-qa-83d832]
     }

     # execution/outputs.tf
     output "iam-role-ExecutionRole-backend-v1-qa-83d832-Arn" {
       value = aws_iam_role.iam-role-ExecutionRole-backend-v1-qa-83d832.arn
     }

     output "iam-role-ExecutionRole-backend-v1-qa-83d832-RoleId" {
       value = aws_iam_role.iam-role-ExecutionRole-backend-v1-qa-83d832.unique_id
     }

     output "iam-role-ExecutionRole-backend-v1-qa-83d832-RoleName" {
       value = aws_iam_role.iam-role-ExecutionRole-backend-v1-qa-83d832.name
     }

     output "lambda-function-backend-v1-qa-83d832-Arn" {
       value = aws_lambda_function.lambda-function-backend-v1-qa-83d832.arn
     }

     output "lambda-function-backend-v1-qa-83d832-FunctionName" {
       value = aws_lambda_function.lambda-function-backend-v1-qa-83d832.function_name
     }

     output "lambda-function-backend-v1-qa-83d832-FunctionUrl" {
       value = aws_lambda_function_url.lambda-function-backend-v1-qa-83d832_url.function_url
     }

     output "lambda-function-backend-v1-qa-83d832-FunctionUrlDomainName" {
       value = trimsuffix(trimprefix(aws_lambda_function_url.lambda-function-backend-v1-qa-83d832_url.function_url, "https://"), "/")
     }

     # execution/terragrunt.hcl
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

     dependency "imageTagModule" {
       config_path = "../imageTagModule"

       mock_outputs = {
         "ecr-image-tag-us-east-1-family_image-0-0-1" = { imageUri = "mock-ecr-image-tag-us-east-1-family_image-0-0-1-imageUri" }
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
       mock_outputs_merge_strategy_with_state = "shallow"
     }

     inputs = {
       ecr_image_tag_us_east_1_family_image_0_0_1 = dependency.imageTagModule.outputs["ecr-image-tag-us-east-1-family_image-0-0-1"]
     }

     # execution/variables.tf
     variable "ecr_image_tag_us_east_1_family_image_0_0_1" {
       type = map(string)
     }

     # imageTagModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         external = {
           source = "hashicorp/external"
         }
         null = {
           source = "hashicorp/null"
         }
       }
     }

     data "external" "ecr-image-tag-us-east-1-family_image-0-0-1" {
       program = ["octo", "get-response", "--resourceId=ecr-image-tag-us-east-1-family/image-0-0-1"]
       depends_on = [null_resource.ecr-image-tag-us-east-1-family_image-0-0-1]
     }

     resource "null_resource" "ecr-image-tag-us-east-1-family_image-0-0-1" {
       triggers = {
         octo_properties_hash = "40cce927f1b77b10"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=ecr-image-tag-us-east-1-family/image-0-0-1"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=ecr-image-tag-us-east-1-family/image-0-0-1"
       }
     }

     # imageTagModule/outputs.tf
     output "ecr-image-tag-us-east-1-family_image-0-0-1" {
       value = data.external.ecr-image-tag-us-east-1-family_image-0-0-1.result
     }

     # imageTagModule/terragrunt.hcl
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

     # imageTagModule/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsLambdaExecutionModelAction",
       ],
       [
         "AddAwsLambdaExecutionOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-qa-83d832",
       "+ @octo/lambda-function=lambda-function-backend-v1-qa-83d832",
     ]
    `);
  });

  it('should answer on a signed URL, and admit each invoking account', async () => {
    await setup(testModuleContainer);
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          {
            inputs: executionInputs({ invokerAccountIds: ['210987654321'] }),
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toContain('resource "aws_lambda_function_url" "lambda-function-backend-v1-qa-83d832_url"');
    expect(hclRender).toContain('authorization_type = "AWS_IAM"');
    expect(hclRender).toContain('principal = "210987654321"');
  });

  it('should run on the processor the image is published for', async () => {
    await setup(testModuleContainer, { publishedFor: 'x86_64' });
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toMatch(/architectures\s*=\s*\["x86_64"]/);
  });

  it('should grant the role the tables the server may reach', async () => {
    await setup(testModuleContainer, { withTableGrant: true });
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toContain('"arn:aws:dynamodb:us-east-1:123:table/accounts"');
    expect(hclRender).toContain('"dynamodb:PutItem"');
  });

  it('should grant the role each of two tables of one name, in its own region', async () => {
    await setup(testModuleContainer, { tableRegions: ['us-east-1', 'eu-west-1'], withTableGrant: true });
    testModuleContainer.registerTerraformProvider('aws', '123', 'eu-west-1');
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toContain('"arn:aws:dynamodb:us-east-1:123:table/accounts"');
    expect(hclRender).toContain('"arn:aws:dynamodb:eu-west-1:123:table/accounts"');
  });

  it('should grant the role the bucket prefixes the server may reach, and admit it to each bucket', async () => {
    await setup(testModuleContainer, { withBucketGrant: true });
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    // The bucket admits the role by reference, and the role reads the prefix by name.
    expect(hclRender).toContain('AWS = [var.iam_role_ExecutionRole_backend_v1_qa_83d832_Arn]');
    expect(hclRender).toContain('"arn:aws:s3:::test-bucket/uploads/*"');
  });

  it("should tell the Lambda Web Adapter the deployment's port, over the execution's own value", async () => {
    await setup(testModuleContainer, { deployment: { ports: [{ containerPort: 3000, protocol: 'tcp' }] } });
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          {
            inputs: executionInputs({ environmentVariables: { AWS_LWA_PORT: '9000' } }),
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toMatch(/AWS_LWA_PORT\s*=\s*"3000"/);
    expect(hclRender).not.toContain('"9000"');
  });

  it('should leave the Lambda Web Adapter its default port when the deployment declares none', async () => {
    await setup(testModuleContainer, { deployment: { ports: [] } });
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).not.toContain('AWS_LWA_PORT');
  });

  it("should run the deployment's command with each argument as given", async () => {
    await setup(testModuleContainer, { deployment: { command: ['node', '--title=api server', 'main.js'] } });
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toMatch(/command\s*=\s*\["node", "--title=api server", "main.js"]/);
  });

  it('should update the function in place when its memory moves', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsLambdaExecutionModule>(
        { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer, { deployment: { memory: 1024 } });
    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsLambdaExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsLambdaExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/lambda-function=lambda-function-backend-v1-qa-83d832",
     ]
    `);
  });

  describe('validation', () => {
    const cases: [string, Partial<DeploymentProperties>, string][] = [
      [
        'an image octo does not publish',
        { image: { kind: 'uri', uri: 'docker.io/nginx:1.27' } },
        'Deployment "v1" must run an image octo publishes into ECR to run on Lambda!',
      ],
      [
        'more than 10 GB of memory',
        { memory: 10241 },
        'Deployment "v1" needs a memory from 128 to 10240 MiB to run on Lambda!',
      ],
      [
        'less than 128 MB of memory',
        { memory: 127 },
        'Deployment "v1" needs a memory from 128 to 10240 MiB to run on Lambda!',
      ],
      [
        'no timeout',
        { timeoutInSeconds: null },
        'Deployment "v1" needs a timeout from 1 to 900 seconds to run on Lambda!',
      ],
      [
        'two ports',
        {
          ports: [
            { containerPort: 8080, protocol: 'tcp' },
            { containerPort: 8081, protocol: 'tcp' },
          ],
        },
        'Deployment "v1" can listen on at most one tcp port to run on Lambda!',
      ],
      [
        'a udp port',
        { ports: [{ containerPort: 8080, protocol: 'udp' }] },
        'Deployment "v1" can listen on at most one tcp port to run on Lambda!',
      ],
      [
        'a timeout over 15 minutes',
        { timeoutInSeconds: 901 },
        'Deployment "v1" needs a timeout from 1 to 900 seconds to run on Lambda!',
      ],
    ];

    for (const [name, deployment, message] of cases) {
      it(`should reject a deployment with ${name}`, async () => {
        await setup(testModuleContainer, { deployment });

        await expect(
          testModuleContainer
            .runModules<AwsLambdaExecutionModule>({
              inputs: executionInputs(),
              moduleId: 'execution',
              type: AwsLambdaExecutionModule,
            })
            .next(),
        ).rejects.toThrow(message);
      });
    }

    it('should reject an image not published in the region the function runs in', async () => {
      await setup(testModuleContainer, { publishedIn: 'us-west-2' });

      await expect(
        testModuleContainer
          .runModules<AwsLambdaExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Image "family/image:0.0.1" is not published in "us-east-1"!');
    });

    it("should reject a granted bucket in another account than the execution's", async () => {
      await setup(testModuleContainer, { bucketAccount: '456', withBucketGrant: true });

      await expect(
        testModuleContainer
          .runModules<AwsLambdaExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Bucket "test-bucket" is in account "456", not in the role\'s account "123"!');
    });

    it("should reject a granted table in another account than the execution's", async () => {
      await setup(testModuleContainer, { tableAccount: '456', withTableGrant: true });

      await expect(
        testModuleContainer
          .runModules<AwsLambdaExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Table "accounts" is in account "456", not in the role\'s account "123"!');
    });

    it('should reject an execution id longer than 50 characters', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsLambdaExecutionModule>({
            inputs: executionInputs({ executionId: 'x'.repeat(51) }),
            moduleId: 'execution',
            type: AwsLambdaExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Property "executionId" in schema could not be validated!');
    });
  });
});
