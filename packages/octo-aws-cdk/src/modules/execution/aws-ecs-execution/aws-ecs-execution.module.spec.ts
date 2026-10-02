import {
  type MatchingResource,
  type ModuleSchemaInputs,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import type { AwsEcsClusterAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import type { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import type { AwsSecurityGroupAnchorSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import type { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';
import type { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import type { AwsSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet.anchor.schema.js';
import { DynamoDB } from '../../../resources/dynamodb/index.js';
import type { EcrImageTagSchema } from '../../../resources/ecr-image-tag/index.schema.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.schema.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { AwsEcsExecutionModule } from './index.js';

/**
 * `clusterName` names both the cluster anchor the execution reads and the ECS Cluster resource it
 * resolves to, so passing a different one is how a test hands the same execution a different cluster.
 *
 * `publishedImageTag` makes the deployment run a tag of an image octo published, as `AwsDeploymentModule`
 * links it: the deployment names the image and tag, and an `ecr-image-tag` resource stands behind it,
 * which is what the execution binds the task definition to. `publishedFor` is the processor that tag
 * is built for.
 *
 * `publishedIn` is the region that tag is published in, which is not the execution's when it differs
 * from `us-east-1`.
 *
 * `deployment` overrides what the main deployment's anchor holds.
 *
 * `withGrants` gives the server read access to a bucket prefix and read-write access to a table, as
 * `AwsServerModule` holds them. `bucketAccount` and `tableAccount` are the accounts those are created in.
 *
 * `sidecar` adds a sidecar deployment `sidecar-v1` in module `sidecarModule`, on server `logger` or on
 * the main server. With `grants`, its server is granted a table of its own. With `publishedImageTag`,
 * it runs a tag of the same image as the main deployment, built for `publishedFor`.
 */
async function setup(
  testModuleContainer: TestModuleContainer,
  {
    bucketAccount = '123',
    clusterName = 'region-qa',
    deployment: deploymentProperties = {},
    publishedFor = 'x86_64',
    publishedImageTag,
    publishedIn = 'us-east-1',
    sidecar,
    tableAccount = '123',
    withGrants = false,
  }: {
    bucketAccount?: string;
    clusterName?: string;
    deployment?: Partial<AwsDeploymentAnchorSchema['properties']>;
    publishedFor?: 'arm64' | 'x86_64';
    publishedImageTag?: string;
    publishedIn?: string;
    sidecar?: {
      grants?: boolean;
      onMainServer?: boolean;
      publishedFor?: 'arm64' | 'x86_64';
      publishedImageTag?: string;
    };
    tableAccount?: string;
    withGrants?: boolean;
  } = {},
): Promise<void> {
  const {
    app: [app],
    deployment: [deployment],
    environment: [environment],
    filesystem: [filesystem],
    region: [region],
    server: [server],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    deployment: ['v1'],
    environment: ['qa'],
    filesystem: ['test-filesystem'],
    region: ['region'],
    server: ['backend'],
    subnet: ['private-subnet'],
  });
  const deploymentAnchor = testModuleContainer.createTestAnchor<AwsDeploymentAnchorSchema>(
    'AwsDeploymentAnchor',
    {
      command: '/bin/sh',
      cpu: 256,
      image: publishedImageTag
        ? { imageId: 'family/image', imageTag: publishedImageTag, kind: 'ecr' }
        : { kind: 'uri', uri: 'docker.io' },
      memory: 512,
      ports: [{ containerPort: 8080, protocol: 'tcp' }],
      timeoutInSeconds: null,
      ...deploymentProperties,
    },
    deployment,
  );
  deployment.addAnchor(deploymentAnchor);

  // The sidecar is a module of its own, so that each deployment has a stub of its own.
  const {
    deployment: [sidecarDeployment],
    server: [sidecarServer],
  } = sidecar
    ? await testModuleContainer.createTestModels(
        'sidecarModule',
        sidecar.onMainServer
          ? { deployment: ['sidecar-v1'], server: [server] }
          : { app: [app], deployment: ['sidecar-v1'], server: ['logger'] },
      )
    : { deployment: [], server: [] };
  const sidecarDeploymentAnchor = sidecarDeployment
    ? testModuleContainer.createTestAnchor<AwsDeploymentAnchorSchema>(
        'AwsDeploymentAnchor',
        {
          command: '/bin/logger',
          cpu: null,
          image: sidecar!.publishedImageTag
            ? { imageId: 'family/image', imageTag: sidecar!.publishedImageTag, kind: 'ecr' }
            : { kind: 'uri', uri: 'docker.io/logger' },
          memory: null,
          ports: [],
          timeoutInSeconds: null,
        },
        sidecarDeployment,
      )
    : undefined;
  if (sidecarDeploymentAnchor) {
    sidecarDeployment.addAnchor(sidecarDeploymentAnchor);
  }

  if (sidecarServer && sidecarServer !== server) {
    sidecarServer.addAnchor(
      testModuleContainer.createTestAnchor<AwsServerAnchorSchema>(
        'AwsServerAnchor',
        {
          grants: {
            dynamodb: sidecar!.grants ? [{ allowRead: true, allowWrite: false, tableName: 'logs' }] : [],
            s3: [],
          },
          serverKey: 'logger',
        },
        sidecarServer,
      ),
    );
    sidecarServer.addAnchor(
      testModuleContainer.createTestAnchor<AwsSecurityGroupAnchorSchema>(
        'AwsSecurityGroupAnchor',
        { rules: [], securityGroupName: 'SecurityGroup-logger' },
        sidecarServer,
      ),
    );
  }

  environment.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsClusterAnchorSchema>(
      'AwsEcsClusterAnchor',
      { clusterName, environmentVariables: { NODE_ENV: 'qa' } },
      environment,
    ),
  );

  const efsFilesystemAnchor = testModuleContainer.createTestAnchor<AwsEfsAnchorSchema>(
    'AwsEfsAnchor',
    { filesystemName: 'test-filesystem' },
    filesystem,
  );
  filesystem.addAnchor(efsFilesystemAnchor);

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

  const serverAnchor = testModuleContainer.createTestAnchor<AwsServerAnchorSchema>(
    'AwsServerAnchor',
    {
      grants: withGrants
        ? {
            dynamodb: [{ allowRead: true, allowWrite: true, tableName: 'accounts' }],
            s3: [{ accessPrefix: 'uploads', allowRead: true, allowWrite: false, bucketName: 'test-bucket' }],
          }
        : { dynamodb: [], s3: [] },
      serverKey: 'backend',
    },
    server,
  );
  server.addAnchor(serverAnchor);
  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsSecurityGroupAnchorSchema>(
      'AwsSecurityGroupAnchor',
      { rules: [], securityGroupName: 'SecurityGroup-backend' },
      server,
    ),
  );

  const subnetAnchor = testModuleContainer.createTestAnchor<AwsSubnetAnchorSchema>(
    'AwsSubnetAnchor',
    {
      AvailabilityZone: 'us-east-1a',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      CidrBlock: '10.0.0.0/8',
      subnetName: 'private-subnet',
    },
    subnet,
  );
  subnet.addAnchor(subnetAnchor);

  const subnetLocalFilesystemMountOverlayContext = [
    '@octo/subnet-local-filesystem-mount-overlay=subnet-local-filesystem-mount-overlay',
    subnet.subnetName,
    filesystem.filesystemName,
  ].join('-');
  const testOverlays = await testModuleContainer.createTestOverlays('testModule', [
    {
      anchors: [efsFilesystemAnchor, subnetAnchor],
      context: subnetLocalFilesystemMountOverlayContext,
      properties: {
        filesystemName: filesystem.filesystemName,
        regionId: region.regionId,
        subnetId: subnet.subnetId,
        subnetName: subnet.subnetName,
      },
    },
  ]);
  const subnetLocalFilesystemMountOverlay = testOverlays[subnetLocalFilesystemMountOverlayContext];
  subnet.addAnchor(
    testModuleContainer.createTestAnchor<AwsSubnetLocalFilesystemMountAnchorSchema>(
      `AwsSubnetLocalFilesystemMountAnchor-${filesystem.filesystemName}`,
      {
        awsAccountId: '123',
        awsRegionId: 'us-east-1',
        filesystemName: filesystem.filesystemName,
        subnetName: 'private-subnet',
      },
      subnetLocalFilesystemMountOverlay,
    ),
  );

  await testModuleContainer.createTestResources<
    [EcsClusterSchema, EfsSchema, EfsMountTargetSchema, SubnetSchema, VpcSchema]
  >(
    'testModule',
    [
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', clusterName },
        resourceContext: `@octo/ecs-cluster=ecs-cluster-${clusterName}`,
        response: { clusterArn: 'clusterArn' },
      },
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', filesystemName: 'test-filesystem' },
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
      },
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1' },
        resourceContext: '@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem',
        response: { MountTargetId: 'MountTargetId', NetworkInterfaceId: 'NetworkInterfaceId' },
      },
      {
        properties: {
          AvailabilityZone: 'us-east-1a',
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/8',
          subnetName: 'private-subnet',
        },
        resourceContext: '@octo/subnet=subnet-region-private-subnet',
        response: { SubnetId: 'SubnetId' },
      },
      {
        properties: {
          awsAccountId: '123',
          awsAvailabilityZones: ['us-east-1a'],
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/24',
          InstanceTenancy: 'default',
        },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
      },
    ],
    { save: true },
  );

  const publishedDeployments = [
    {
      architecture: publishedFor,
      deploymentAnchor,
      deploymentTag: 'v1',
      imageTag: publishedImageTag,
      serverKey: 'backend',
    },
    {
      architecture: sidecar?.publishedFor ?? 'x86_64',
      deploymentAnchor: sidecarDeploymentAnchor,
      deploymentTag: 'sidecar-v1',
      imageTag: sidecar?.publishedImageTag,
      serverKey: sidecar?.onMainServer ? 'backend' : 'logger',
    },
  ].filter((d) => d.imageTag);
  if (publishedDeployments.length > 0) {
    const {
      image: [image],
    } = await testModuleContainer.createTestModels('imageModule', { app: [app], image: ['family/image'] });
    const imageAnchor = testModuleContainer.createTestAnchor<AwsEcrImageAnchorSchema>(
      'AwsEcrImageAnchor',
      { imageId: image.imageId },
      image,
    );
    image.addAnchor(imageAnchor);

    const publishedTags = new Map(publishedDeployments.map((d) => [d.imageTag!, d.architecture]));
    for (const [imageTag, architecture] of publishedTags) {
      const imageTagId = imageTag.replace(/[^\w-]/g, '-');
      await testModuleContainer.createTestOverlays('imageTagModule', [
        {
          anchors: [imageAnchor],
          context: `@octo/aws-ecr-image-tag-overlay=aws-ecr-image-tag-overlay-family/image-${imageTagId}`,
          properties: {
            architecture,
            dockerfileDirectory: 'images/backend',
            dockerfileName: 'Dockerfile',
            imageId: image.imageId,
            imageTag,
          },
        },
      ]);
      await testModuleContainer.createTestResources<[EcrImageTagSchema]>(
        'imageTagModule',
        [
          {
            properties: {
              architecture,
              awsAccountId: '123',
              awsRegionId: publishedIn,
              dockerfileDirectory: 'images/backend',
              dockerfileName: 'Dockerfile',
              imageId: image.imageId,
              imageTag,
            },
            resourceContext: `@octo/ecr-image-tag=ecr-image-tag-${publishedIn}-family/image-${imageTagId}`,
            response: { imageUri: `123.dkr.ecr.${publishedIn}.amazonaws.com/family/image:${imageTag}` },
          },
        ],
        { save: true },
      );
    }

    for (const { deploymentAnchor: anchor, deploymentTag, imageTag, serverKey } of publishedDeployments) {
      await testModuleContainer.createTestOverlays('testModule', [
        {
          anchors: [anchor!, imageAnchor],
          context: `@octo/aws-deployment-image-overlay=aws-deployment-image-overlay-${deploymentTag}`,
          properties: { deploymentTag, imageId: image.imageId, imageTag: imageTag!, serverKey },
        },
      ]);
    }
  }

  if (withGrants) {
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
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          blockPublicAccess: true,
          Bucket: 'test-bucket',
          permissions: [],
        }),
      ],
      { save: true },
    );

    const {
      service: [table],
    } = await testModuleContainer.createTestModels('tableModule', {
      app: [app],
      service: [['accounts', { tableName: 'accounts' }]],
    });
    const tableAnchor = testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
      'AwsDynamoDBAnchor',
      { awsAccountId: tableAccount, TableName: 'accounts' },
      table,
    );
    table.addAnchor(tableAnchor);
    await testModuleContainer.createResources(
      'tableModule',
      [
        new DynamoDB('dynamodb-accounts', {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
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
      {
        anchors: [serverAnchor, tableAnchor],
        context: '@octo/aws-server-dynamodb-access-overlay=aws-server-dynamodb-access-overlay-accounts',
        properties: { allowRead: true, allowWrite: true, serverKey: 'backend', tableName: 'accounts' },
      },
    ]);
  }
}

/**
 * The inputs every case that does not vary them runs the same execution with.
 */
function executionInputs(): ModuleSchemaInputs<AwsEcsExecutionModule> {
  return {
    deployments: {
      main: {
        containerProperties: { image: { essential: true, name: 'backend-v1' } },
        deployment: stub('${{testModule.model.deployment}}'),
      },
      sidecars: [],
    },
    desiredCount: 1,
    environment: stub('${{testModule.model.environment}}'),
    executionId: 'backend-v1-region-qa-private-subnet',
    subnet: stub('${{testModule.model.subnet}}'),
  };
}

/**
 * The inputs of {@link executionInputs}, with the sidecar deployment `setup` adds running beside the
 * main one.
 */
function sidecarExecutionInputs(): ModuleSchemaInputs<AwsEcsExecutionModule> {
  const inputs = executionInputs();
  inputs.deployments.sidecars = [
    {
      containerProperties: { image: { essential: false, name: 'logger' } },
      deployment: stub('${{sidecarModule.model.deployment}}'),
    },
  ];
  return inputs;
}

/**
 * The resources the task definition is built on top of, as this run's diffs carry it.
 */
function taskDefinitionParents(resourceDiffs: Parameters<TestModuleContainer['digestDiffs']>[0]): string[] {
  const taskDefinition = resourceDiffs
    .flat()
    .map((d) => d.node as unknown as { parents: MatchingResource<never>[]; resourceId: string })
    .find((n) => n.resourceId === 'ecs-task-definition-backend-v1-region-qa-private-subnet')!;

  return taskDefinition.parents.map((p) => p.getActual().getContext());
}

describe('AwsEcsExecutionModule UT', () => {
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
    await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEcsExecutionModule>(
      {
        inputs: {
          deployments: {
            main: {
              containerProperties: {
                image: {
                  essential: true,
                  name: 'backend-v1',
                },
              },
              deployment: stub('${{testModule.model.deployment}}'),
            },
            sidecars: [],
          },
          desiredCount: 1,
          environment: stub('${{testModule.model.environment}}'),
          executionId: 'backend-v1-region-qa-private-subnet',
          subnet: stub('${{testModule.model.subnet}}'),
        },
        moduleId: 'execution',
        type: AwsEcsExecutionModule,
      },
      { filterByModuleIds: ['execution'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
     "# execution/main.tf
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
       allowed_account_ids = ["123"]
     }

     resource "aws_security_group" "sec-grp-SecurityGroup-backend" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region.VpcId
     }

     resource "aws_security_group" "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region.VpcId
     }

     resource "aws_vpc_security_group_egress_rule" "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet_egress_0" {
       provider = aws._123-us-east-1
       cidr_ipv4 = "0.0.0.0/0"
       description = "all traffic 0.0.0.0/0"
       ip_protocol = "-1"
       security_group_id = aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.id

       depends_on = [aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet]
     }

     resource "aws_iam_role" "iam-role-ExecutionRole-backend-v1-region-qa-private-subnet" {
       provider = aws._123-us-east-1
       assume_role_policy = jsonencode({
         Statement = [{
             Action = "sts:AssumeRole"
             Effect = "Allow"
             Principal = {
               Service = "ecs-tasks.amazonaws.com"
             }
           }]
         Version = "2012-10-17"
       })
       name = "ExecutionRole-backend-v1-region-qa-private-subnet"
     }

     resource "aws_iam_role_policy_attachment" "iam-role-ExecutionRole-backend-v1-region-qa-private-subnet_AmazonECSTaskExecutionRolePolicy" {
       provider = aws._123-us-east-1
       policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
       role = aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet.name

       depends_on = [aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet]
     }

     resource "aws_ecs_task_definition" "ecs-task-definition-backend-v1-region-qa-private-subnet" {
       provider = aws._123-us-east-1
       container_definitions = jsonencode([
         {
           command = ["/bin/sh"]
           environment = [{
               name = "NODE_ENV"
               value = "qa"
             }]
           essential = true
           image = "docker.io"
           mountPoints = []
           name = "backend-v1"
           portMappings = [{
               containerPort = 8080
               hostPort = 8080
               protocol = "tcp"
             }]
         }
       ])
       cpu = "256"
       execution_role_arn = aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet.arn
       family = "qa-region-private-subnet-backend"
       memory = "512"
       network_mode = "awsvpc"
       requires_compatibilities = ["FARGATE"]
       runtime_platform {
         cpu_architecture = "X86_64"
         operating_system_family = "LINUX"
       }
       task_role_arn = aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet.arn
     }

     resource "aws_ecs_service" "ecs-service-backend-v1-region-qa-private-subnet" {
       provider = aws._123-us-east-1
       cluster = var.ecs_cluster_region_qa.clusterArn
       desired_count = 1
       launch_type = "FARGATE"
       name = "backend-v1-region-qa-private-subnet"
       network_configuration {
         assign_public_ip = false
         security_groups = [aws_security_group.sec-grp-SecurityGroup-backend.id, aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.id]
         subnets = [var.subnet_region_private_subnet.SubnetId]
       }
       task_definition = aws_ecs_task_definition.ecs-task-definition-backend-v1-region-qa-private-subnet.arn
     }

     # execution/outputs.tf
     output "sec-grp-SecurityGroup-backend-Arn" {
       value = aws_security_group.sec-grp-SecurityGroup-backend.arn
     }

     output "sec-grp-SecurityGroup-backend-GroupId" {
       value = aws_security_group.sec-grp-SecurityGroup-backend.id
     }

     output "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet-Arn" {
       value = aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.arn
     }

     output "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet-GroupId" {
       value = aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.id
     }

     output "iam-role-ExecutionRole-backend-v1-region-qa-private-subnet-Arn" {
       value = aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet.arn
     }

     output "iam-role-ExecutionRole-backend-v1-region-qa-private-subnet-RoleId" {
       value = aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet.unique_id
     }

     output "iam-role-ExecutionRole-backend-v1-region-qa-private-subnet-RoleName" {
       value = aws_iam_role.iam-role-ExecutionRole-backend-v1-region-qa-private-subnet.name
     }

     output "ecs-task-definition-backend-v1-region-qa-private-subnet-revision" {
       value = aws_ecs_task_definition.ecs-task-definition-backend-v1-region-qa-private-subnet.revision
     }

     output "ecs-task-definition-backend-v1-region-qa-private-subnet-taskDefinitionArn" {
       value = aws_ecs_task_definition.ecs-task-definition-backend-v1-region-qa-private-subnet.arn
     }

     output "ecs-service-backend-v1-region-qa-private-subnet-serviceArn" {
       value = aws_ecs_service.ecs-service-backend-v1-region-qa-private-subnet.id
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

     dependency "testModule" {
       config_path = "../testModule"

       mock_outputs = {
         "ecs-cluster-region-qa" = { clusterArn = "mock-ecs-cluster-region-qa-clusterArn" }
         "subnet-region-private-subnet" = { SubnetId = "mock-subnet-region-private-subnet-SubnetId" }
         "vpc-region" = { VpcId = "mock-vpc-region-VpcId" }
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
       mock_outputs_merge_strategy_with_state = "shallow"
     }

     inputs = {
       ecs_cluster_region_qa = dependency.testModule.outputs["ecs-cluster-region-qa"]
       subnet_region_private_subnet = dependency.testModule.outputs["subnet-region-private-subnet"]
       vpc_region = dependency.testModule.outputs["vpc-region"]
     }

     # execution/variables.tf
     variable "ecs_cluster_region_qa" {
       type = map(string)
     }

     variable "subnet_region_private_subnet" {
       type = map(string)
     }

     variable "vpc_region" {
       type = map(string)
     }

     # testModule/main.tf
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

     data "external" "ecs-cluster-region-qa" {
       program = ["octo", "get-response", "--resourceId=ecs-cluster-region-qa"]
       depends_on = [null_resource.ecs-cluster-region-qa]
     }

     data "external" "efs-region-test-filesystem" {
       program = ["octo", "get-response", "--resourceId=efs-region-test-filesystem"]
       depends_on = [null_resource.efs-region-test-filesystem]
     }

     data "external" "efs-mount-region-private-subnet-test-filesystem" {
       program = ["octo", "get-response", "--resourceId=efs-mount-region-private-subnet-test-filesystem"]
       depends_on = [null_resource.efs-mount-region-private-subnet-test-filesystem]
     }

     data "external" "subnet-region-private-subnet" {
       program = ["octo", "get-response", "--resourceId=subnet-region-private-subnet"]
       depends_on = [null_resource.subnet-region-private-subnet]
     }

     data "external" "vpc-region" {
       program = ["octo", "get-response", "--resourceId=vpc-region"]
       depends_on = [null_resource.vpc-region]
     }

     resource "null_resource" "ecs-cluster-region-qa" {
       triggers = {
         octo_properties_hash = "da2c133b3ff12ab8"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=ecs-cluster-region-qa"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=ecs-cluster-region-qa"
       }
     }

     resource "null_resource" "efs-region-test-filesystem" {
       triggers = {
         octo_properties_hash = "1a31f0c2f24ce06f"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=efs-region-test-filesystem"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=efs-region-test-filesystem"
       }
     }

     resource "null_resource" "efs-mount-region-private-subnet-test-filesystem" {
       triggers = {
         octo_properties_hash = "4c9717384d508cbf"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=efs-mount-region-private-subnet-test-filesystem"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=efs-mount-region-private-subnet-test-filesystem"
       }
     }

     resource "null_resource" "subnet-region-private-subnet" {
       triggers = {
         octo_properties_hash = "8f35c7a4d38e129c"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=subnet-region-private-subnet"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=subnet-region-private-subnet"
       }
     }

     resource "null_resource" "vpc-region" {
       triggers = {
         octo_properties_hash = "f548f82f959ec360"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=vpc-region"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=vpc-region"
       }
     }

     # testModule/outputs.tf
     output "ecs-cluster-region-qa" {
       value = data.external.ecs-cluster-region-qa.result
     }

     output "efs-region-test-filesystem" {
       value = data.external.efs-region-test-filesystem.result
     }

     output "efs-mount-region-private-subnet-test-filesystem" {
       value = data.external.efs-mount-region-private-subnet-test-filesystem.result
     }

     output "subnet-region-private-subnet" {
       value = data.external.subnet-region-private-subnet.result
     }

     output "vpc-region" {
       value = data.external.vpc-region.result
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
         "AddAwsEcsExecutionModelAction",
       ],
       [
         "AddAwsEcsExecutionServerSecurityGroupOverlayAction",
       ],
       [
         "AddAwsEcsExecutionOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const updateDeployment = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      command: 'npm start',
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateDeployment.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateDeployment.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const updateDeploymentRevert = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateDeploymentRevert.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateDeploymentRevert.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const updateDesiredCount = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 2,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateDesiredCount.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateDesiredCount.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const addFilesystem = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 2,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              filesystems: [stub('${{testModule.model.filesystem}}')],
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(addFilesystem.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addFilesystem.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const addSecurityGroupRule = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 2,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              filesystems: [stub('${{testModule.model.filesystem}}')],
              securityGroupRules: [
                {
                  CidrBlock: '10.0.0.0/8',
                  Egress: true,
                  FromPort: 8080,
                  IpProtocol: 'tcp',
                  ToPort: 8080,
                },
              ],
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(addSecurityGroupRule.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addSecurityGroupRule.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            hidden: true,
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 2,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              filesystems: [stub('${{testModule.model.filesystem}}')],
              securityGroupRules: [
                {
                  CidrBlock: '10.0.0.0/8',
                  Egress: true,
                  FromPort: 8080,
                  IpProtocol: 'tcp',
                  ToPort: 8080,
                },
              ],
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "- @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "- @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "- @octo/security-group=sec-grp-SecurityGroup-backend",
       "- @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "- @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
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
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/security-group=sec-grp-SecurityGroup-backend",
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/security-group=sec-grp-SecurityGroup-backend",
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle deployment change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsExecutionModule>(
            {
              inputs: {
                deployments: {
                  main: {
                    containerProperties: {
                      image: {
                        essential: true,
                        name: 'change-backend-v1',
                      },
                    },
                    deployment: stub('${{testModule.model.deployment}}'),
                  },
                  sidecars: [],
                },
                desiredCount: 1,
                environment: stub('${{testModule.model.environment}}'),
                executionId: 'backend-v1-region-qa-private-subnet',
                subnet: stub('${{testModule.model.subnet}}'),
              },
              moduleId: 'execution',
              type: AwsEcsExecutionModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       ]
      `);
    });

    it('should handle desiredCount change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsExecutionModule>(
            {
              inputs: {
                deployments: {
                  main: {
                    containerProperties: {
                      image: {
                        essential: true,
                        name: 'backend-v1',
                      },
                    },
                    deployment: stub('${{testModule.model.deployment}}'),
                  },
                  sidecars: [],
                },
                desiredCount: 2,
                environment: stub('${{testModule.model.environment}}'),
                executionId: 'backend-v1-region-qa-private-subnet',
                subnet: stub('${{testModule.model.subnet}}'),
              },
              moduleId: 'execution',
              type: AwsEcsExecutionModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       ]
      `);
    });

    it('should handle executionId change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsExecutionModule>(
            {
              inputs: {
                deployments: {
                  main: {
                    containerProperties: {
                      image: {
                        essential: true,
                        name: 'backend-v1',
                      },
                    },
                    deployment: stub('${{testModule.model.deployment}}'),
                  },
                  sidecars: [],
                },
                desiredCount: 1,
                environment: stub('${{testModule.model.environment}}'),
                executionId: 'changed-execution-id',
                subnet: stub('${{testModule.model.subnet}}'),
              },
              moduleId: 'execution',
              type: AwsEcsExecutionModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
         "- @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
         "- @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         "- @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
         "- @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
         "+ @octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
         "+ @octo/iam-role=iam-role-ExecutionRole-changed-execution-id",
         "* @octo/iam-role=iam-role-ExecutionRole-changed-execution-id",
         "+ @octo/ecs-task-definition=ecs-task-definition-changed-execution-id",
         "+ @octo/ecs-service=ecs-service-changed-execution-id",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsExecutionModule>(
        {
          inputs: {
            deployments: {
              main: {
                containerProperties: {
                  image: {
                    essential: true,
                    name: 'backend-v1',
                  },
                },
                deployment: stub('${{testModule.model.deployment}}'),
              },
              sidecars: [],
            },
            desiredCount: 1,
            environment: stub('${{testModule.model.environment}}'),
            executionId: 'backend-v1-region-qa-private-subnet',
            subnet: stub('${{testModule.model.subnet}}'),
          },
          moduleId: 'execution-1',
          type: AwsEcsExecutionModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          {
            inputs: {
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v1',
                    },
                  },
                  deployment: stub('${{testModule.model.deployment}}'),
                },
                sidecars: [],
              },
              desiredCount: 1,
              environment: stub('${{testModule.model.environment}}'),
              executionId: 'backend-v1-region-qa-private-subnet',
              subnet: stub('${{testModule.model.subnet}}'),
            },
            moduleId: 'execution-2',
            type: AwsEcsExecutionModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should replace the service when it is handed a different cluster', async () => {
    const inputs: ModuleSchemaInputs<AwsEcsExecutionModule> = {
      deployments: {
        main: {
          containerProperties: { image: { essential: true, name: 'backend-v1' } },
          deployment: stub('${{testModule.model.deployment}}'),
        },
        sidecars: [],
      },
      desiredCount: 1,
      environment: stub('${{testModule.model.environment}}'),
      executionId: 'backend-v1-region-qa-private-subnet',
      subnet: stub('${{testModule.model.subnet}}'),
    };

    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsExecutionModule>(
        { inputs, moduleId: 'execution', type: AwsEcsExecutionModule },
        {
          terraformTarget: 'skip',
        },
      )
      .next();

    // Renaming an environment recreates its cluster, which hands this execution's service a cluster
    // it did not have before. `cluster` is force-new on aws_ecs_service, so the service is recreated -
    // and octo has to say so itself, since validate cascades from a REPLACE but not from an UPDATE.
    await setup(testModuleContainer, { clusterName: 'region-changed-qa' });
    const { hclRender, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs, moduleId: 'execution', type: AwsEcsExecutionModule },
          {
            terraformTarget: 'skip',
          },
        )
        .next()
    ).value!;

    // The service is recreated onto the new cluster, not orphaned by the old one's delete. Asserted
    // because the digest below cannot show it: `setup` saves its fixtures straight into applied state,
    // so the new cluster's arrival produces no diff while the old cluster's departure does, and the
    // two lines alone read as a service left without a cluster.
    expect(hclRender).toContain('cluster = var.ecs_cluster_region_changed_qa.clusterArn');

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/ecs-cluster=ecs-cluster-region-qa",
       "^ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
  });

  // The binding shows in two places, and both are needed. In the resource graph it holds a published
  // image back until the task definition has stopped running it, because octo deletes an image
  // itself at commit, outside terraform's own ordering. In the generated terraform it names the
  // image by reference, which is what orders the push before the task definition that runs it.
  it('should bind the task definition to the published image it runs', async () => {
    await setup(testModuleContainer, { publishedImageTag: '0.0.1' });

    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(taskDefinitionParents(resourceDiffs)).toEqual([
      '@octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet',
      '@octo/ecr-image-tag=ecr-image-tag-us-east-1-family/image-0-0-1',
    ]);

    // The container names the image's output, never the URI it was matched on.
    expect(hclDiff).toContain('image = var.ecr_image_tag_us_east_1_family_image_0_0_1.imageUri');
    expect(hclDiff).not.toContain('123.dkr.ecr.us-east-1.amazonaws.com/family/image:0.0.1');

    // Naming that output is what makes the image folder a dependency of this one, which is the
    // ordering terraform has no other way to know about. Mocks stand in for a plan, never an apply.
    expect(hclDiff).toContain(
      'ecr_image_tag_us_east_1_family_image_0_0_1 = dependency.imageTagModule.outputs["ecr-image-tag-us-east-1-family_image-0-0-1"]',
    );
    expect(hclDiff).toContain('mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]');
  });

  it('should run the task on the processor the image is published for', async () => {
    await setup(testModuleContainer, { publishedFor: 'arm64', publishedImageTag: '0.0.1' });

    const { hclDiff } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclDiff).toMatch(/cpu_architecture\s*=\s*"ARM64"/);
  });

  it('should leave the task definition unbound when it runs an image octo did not publish', async () => {
    await setup(testModuleContainer);

    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(taskDefinitionParents(resourceDiffs)).toEqual([
      '@octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet',
    ]);

    // There is no resource behind the image, so the container names it by URI and nothing orders it.
    expect(hclDiff).toContain('image = "docker.io"');
  });

  it("should create the role this execution runs as, holding the server's grants", async () => {
    await setup(testModuleContainer, { withGrants: true });

    const { hclRender, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    // The bucket admits the role by reference, and the role reads the table by name.
    expect(hclRender).toContain('AWS = [var.iam_role_ExecutionRole_backend_v1_region_qa_private_subnet_Arn]');
    expect(hclRender).toContain('"arn:aws:dynamodb:us-east-1:123:table/accounts/index/*"');
  });

  it('should open the execution to the server of each deployment', async () => {
    await setup(testModuleContainer, { sidecar: {} });

    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: sidecarExecutionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-logger",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
  });

  it('should open the execution to a server once when a sidecar runs on the main server', async () => {
    await setup(testModuleContainer, { sidecar: { onMainServer: true } });

    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: sidecarExecutionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "* @octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
  });

  it('should bind the task definition to the published image of each deployment', async () => {
    await setup(testModuleContainer, { publishedImageTag: '0.0.1', sidecar: { publishedImageTag: '0.0.2' } });

    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: sidecarExecutionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(taskDefinitionParents(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "@octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "@octo/ecr-image-tag=ecr-image-tag-us-east-1-family/image-0-0-1",
       "@octo/ecr-image-tag=ecr-image-tag-us-east-1-family/image-0-0-2",
     ]
    `);
  });

  it('should bind the task definition once to a published image two deployments run', async () => {
    await setup(testModuleContainer, { publishedImageTag: '0.0.1', sidecar: { publishedImageTag: '0.0.1' } });

    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: sidecarExecutionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(taskDefinitionParents(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "@octo/iam-role=iam-role-ExecutionRole-backend-v1-region-qa-private-subnet",
       "@octo/ecr-image-tag=ecr-image-tag-us-east-1-family/image-0-0-1",
     ]
    `);
  });

  describe('validation', () => {
    it('should reject a sidecar whose server grants anything', async () => {
      await setup(testModuleContainer, { sidecar: { grants: true } });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: sidecarExecutionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow(
        'Server "logger" of a sidecar cannot grant anything! A sidecar runs with the grants of server "backend".',
      );
    });

    it("should reject a granted bucket in another account than the execution's", async () => {
      await setup(testModuleContainer, { bucketAccount: '456', withGrants: true });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Bucket "test-bucket" is in account "456", not in the execution\'s account "123"!');
    });

    it("should reject a granted table in another account than the execution's", async () => {
      await setup(testModuleContainer, { tableAccount: '456', withGrants: true });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Table "accounts" is in account "456", not in the execution\'s account "123"!');
    });

    it('should reject a deployment without a command', async () => {
      await setup(testModuleContainer, { deployment: { command: null } });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Deployment "v1" needs a command to run on ECS!');
    });

    it('should reject a main deployment without a cpu and a memory', async () => {
      await setup(testModuleContainer, { deployment: { cpu: null } });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Deployment "v1" needs a cpu and a memory to run on ECS!');
    });

    it('should reject a cpu and a memory ECS does not pair', async () => {
      await setup(testModuleContainer);

      const inputs = executionInputs();
      inputs.deployments.main.containerProperties = {
        ...inputs.deployments.main.containerProperties,
        cpu: 256,
        memory: 4096,
      };
      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({ inputs, moduleId: 'execution', type: AwsEcsExecutionModule })
          .next(),
      ).rejects.toThrow('Invalid values for CPU and/or memory!');
    });

    it('should reject images built for different processors', async () => {
      await setup(testModuleContainer, {
        publishedFor: 'arm64',
        publishedImageTag: '0.0.1',
        sidecar: { publishedFor: 'x86_64', publishedImageTag: '0.0.2' },
      });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: sidecarExecutionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow(
        'Images of execution "backend-v1-region-qa-private-subnet" are built for different processors!',
      );
    });

    it('should reject a published image not published where the task runs', async () => {
      await setup(testModuleContainer, { publishedImageTag: '0.0.1', publishedIn: 'us-west-2' });

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: executionInputs(),
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow('Image "family/image:0.0.1" is not published in "us-east-1"!');
    });

    it('should reject an IAM role name longer than 64 characters', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsEcsExecutionModule>({
            inputs: { ...executionInputs(), executionId: 'x'.repeat(51) },
            moduleId: 'execution',
            type: AwsEcsExecutionModule,
          })
          .next(),
      ).rejects.toThrow(`IAM role name "ExecutionRole-${'x'.repeat(51)}" is longer than 64 characters!`);
    });
  });
});
