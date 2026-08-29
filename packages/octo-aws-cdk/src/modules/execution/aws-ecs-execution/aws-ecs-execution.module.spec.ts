import {
  type MatchingResource,
  type ModuleSchemaInputs,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEcsClusterAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import type { AwsEcsTaskDefinitionAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-task-definition.anchor.schema.js';
import type { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsIamRoleAnchorSchema } from '../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { AwsSecurityGroupAnchorSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import type { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import type { AwsSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet.anchor.schema.js';
import type { EcrImageTagSchema } from '../../../resources/ecr-image-tag/index.schema.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.schema.js';
import type { IamRoleSchema } from '../../../resources/iam-role/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { EcrImageUriUtility } from '../../../utilities/ecr-image-uri/ecr-image-uri.utility.js';
import { AwsEcsExecutionModule } from './index.js';

/**
 * `clusterName` names both the cluster anchor the execution reads and the ECS Cluster resource it
 * resolves to, so passing a different one is how a test hands the same execution a different cluster.
 *
 * `publishedImageUri` makes the deployment run an image octo published: the container names it and an
 * `ecr-image-tag` resource stands behind it, which is what the execution binds the task definition to.
 */
async function setup(
  testModuleContainer: TestModuleContainer,
  { clusterName = 'region-qa', publishedImageUri }: { clusterName?: string; publishedImageUri?: string } = {},
): Promise<void> {
  const {
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
  deployment.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsTaskDefinitionAnchorSchema>(
      'AwsEcsTaskDefinitionAnchor',
      {
        cpu: 256,
        image: {
          command: '/bin/sh',
          ports: [{ containerPort: 8080, protocol: 'tcp' }],
          uri: publishedImageUri ?? 'docker.io',
        },
        memory: 512,
      },
      deployment,
    ),
  );

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

  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsIamRoleAnchorSchema>(
      'AwsIamRoleAnchor',
      { iamRoleName: 'iam-role-ServerRole-backend' },
      server,
    ),
  );
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
    [EcsClusterSchema, EfsSchema, EfsMountTargetSchema, IamRoleSchema, SubnetSchema, VpcSchema]
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
        properties: { awsAccountId: '123', policies: [], rolename: 'iam-role-ServerRole-backend' },
        resourceContext: '@octo/iam-role=iam-role-ServerRole-backend',
        response: { Arn: 'Arn', RoleId: 'RoleId', RoleName: 'iam-role-ServerRole-backend' },
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

  if (publishedImageUri) {
    const { awsAccountId, awsRegionId, imageId, imageTag } = EcrImageUriUtility.parse(publishedImageUri)!;
    await testModuleContainer.createTestResources<[EcrImageTagSchema]>(
      'testModule',
      [
        {
          properties: {
            awsAccountId,
            awsRegionId,
            dockerfileDirectory: 'images/backend',
            dockerfileName: 'Dockerfile',
            imageId,
            imageTag,
          },
          resourceContext: `@octo/ecr-image-tag=ecr-image-tag-${awsRegionId}-${imageId}-${imageTag.replace(/[^\w-]/g, '-')}`,
          response: { imageUri: publishedImageUri },
        },
      ],
      { save: true },
    );
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
     }

     resource "aws_security_group" "sec-grp-SecurityGroup-backend" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region.VpcId
     }

     resource "aws_security_group" "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region.VpcId
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
       execution_role_arn = var.iam_role_ServerRole_backend.Arn
       family = "qa-region-private-subnet-backend"
       memory = "512"
       network_mode = "awsvpc"
       requires_compatibilities = ["FARGATE"]
       task_role_arn = var.iam_role_ServerRole_backend.Arn
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
         "iam-role-ServerRole-backend" = { Arn = "mock-iam-role-ServerRole-backend-Arn" }
         "subnet-region-private-subnet" = { SubnetId = "mock-subnet-region-private-subnet-SubnetId" }
         "vpc-region" = { VpcId = "mock-vpc-region-VpcId" }
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
       mock_outputs_merge_strategy_with_state = "shallow"
     }

     inputs = {
       ecs_cluster_region_qa = dependency.testModule.outputs["ecs-cluster-region-qa"]
       iam_role_ServerRole_backend = dependency.testModule.outputs["iam-role-ServerRole-backend"]
       subnet_region_private_subnet = dependency.testModule.outputs["subnet-region-private-subnet"]
       vpc_region = dependency.testModule.outputs["vpc-region"]
     }

     # execution/variables.tf
     variable "ecs_cluster_region_qa" {
       type = map(string)
     }

     variable "iam_role_ServerRole_backend" {
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

     data "external" "iam-role-ServerRole-backend" {
       program = ["octo", "get-response", "--resourceId=iam-role-ServerRole-backend"]
       depends_on = [null_resource.iam-role-ServerRole-backend]
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

     resource "null_resource" "iam-role-ServerRole-backend" {
       triggers = {
         octo_properties_hash = "6d1a33e75e52b61d"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=iam-role-ServerRole-backend"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=iam-role-ServerRole-backend"
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

     output "iam-role-ServerRole-backend" {
       value = data.external.iam-role-ServerRole-backend.result
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
         "- @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         "- @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
         "- @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
         "+ @octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
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
    await setup(testModuleContainer, { publishedImageUri: '123.dkr.ecr.us-east-1.amazonaws.com/family/image:0.0.1' });

    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsExecutionModule>(
          { inputs: executionInputs(), moduleId: 'execution', type: AwsEcsExecutionModule },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(taskDefinitionParents(resourceDiffs)).toEqual([
      '@octo/iam-role=iam-role-ServerRole-backend',
      '@octo/ecr-image-tag=ecr-image-tag-us-east-1-family/image-0-0-1',
    ]);

    // The container names the image's output, never the URI it was matched on.
    expect(hclDiff).toContain('image = var.ecr_image_tag_us_east_1_family_image_0_0_1.imageUri');
    expect(hclDiff).not.toContain('123.dkr.ecr.us-east-1.amazonaws.com/family/image:0.0.1');

    // Naming that output is what makes the image folder a dependency of this one, which is the
    // ordering terraform has no other way to know about. Mocks stand in for a plan, never an apply.
    expect(hclDiff).toContain(
      'ecr_image_tag_us_east_1_family_image_0_0_1 = dependency.testModule.outputs["ecr-image-tag-us-east-1-family_image-0-0-1"]',
    );
    expect(hclDiff).toContain('mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]');
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

    expect(taskDefinitionParents(resourceDiffs)).toEqual(['@octo/iam-role=iam-role-ServerRole-backend']);

    // There is no resource behind the image, so the container names it by URI and nothing orders it.
    expect(hclDiff).toContain('image = "docker.io"');
  });
});
