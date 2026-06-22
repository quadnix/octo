import {
  type Account,
  type App,
  type Deployment,
  type Environment,
  type Filesystem,
  type Region,
  type Server,
  type Subnet,
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
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.schema.js';
import type { IamRoleSchema } from '../../../resources/iam-role/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { AwsEcsExecutionModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{
  account: Account;
  app: App;
  deployment: Deployment;
  environment: Environment;
  filesystem: Filesystem;
  region: Region;
  server: Server;
  subnet: Subnet;
}> {
  const {
    account: [account],
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
  deployment.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsTaskDefinitionAnchorSchema>(
      'AwsEcsTaskDefinitionAnchor',
      {
        cpu: 256,
        image: { command: '/bin/sh', ports: [{ containerPort: 8080, protocol: 'tcp' }], uri: 'docker.io' },
        memory: 512,
      },
      deployment,
    ),
  );

  environment.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsClusterAnchorSchema>(
      'AwsEcsClusterAnchor',
      { clusterName: 'region-qa', environmentVariables: { NODE_ENV: 'qa' } },
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
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', clusterName: 'region-qa' },
        resourceContext: '@octo/ecs-cluster=ecs-cluster-region-qa',
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

  return { account, app, deployment, environment, filesystem, region, server, subnet };
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
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
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
       mock_outputs_allowed_terraform_commands = ["init", "plan", "validate"]
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
       program = ["cat", "\${path.module}/.octo-outputs/ecs-cluster-region-qa.json"]
       depends_on = [null_resource.ecs-cluster-region-qa]
     }

     data "external" "efs-region-test-filesystem" {
       program = ["cat", "\${path.module}/.octo-outputs/efs-region-test-filesystem.json"]
       depends_on = [null_resource.efs-region-test-filesystem]
     }

     data "external" "efs-mount-region-private-subnet-test-filesystem" {
       program = ["cat", "\${path.module}/.octo-outputs/efs-mount-region-private-subnet-test-filesystem.json"]
       depends_on = [null_resource.efs-mount-region-private-subnet-test-filesystem]
     }

     data "external" "iam-role-ServerRole-backend" {
       program = ["cat", "\${path.module}/.octo-outputs/iam-role-ServerRole-backend.json"]
       depends_on = [null_resource.iam-role-ServerRole-backend]
     }

     data "external" "subnet-region-private-subnet" {
       program = ["cat", "\${path.module}/.octo-outputs/subnet-region-private-subnet.json"]
       depends_on = [null_resource.subnet-region-private-subnet]
     }

     data "external" "vpc-region" {
       program = ["cat", "\${path.module}/.octo-outputs/vpc-region.json"]
       depends_on = [null_resource.vpc-region]
     }

     resource "null_resource" "ecs-cluster-region-qa" {
       triggers = {
         octo_properties_hash = "da2c133b3ff12ab8"
       }
       provisioner "local-exec" {
         command = "mkdir -p \${path.module}/.octo-outputs && octo run-action --resourceId=ecs-cluster-region-qa > \${path.module}/.octo-outputs/ecs-cluster-region-qa.json"
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
         command = "mkdir -p \${path.module}/.octo-outputs && octo run-action --resourceId=efs-region-test-filesystem > \${path.module}/.octo-outputs/efs-region-test-filesystem.json"
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
         command = "mkdir -p \${path.module}/.octo-outputs && octo run-action --resourceId=efs-mount-region-private-subnet-test-filesystem > \${path.module}/.octo-outputs/efs-mount-region-private-subnet-test-filesystem.json"
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
         command = "mkdir -p \${path.module}/.octo-outputs && octo run-action --resourceId=iam-role-ServerRole-backend > \${path.module}/.octo-outputs/iam-role-ServerRole-backend.json"
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
         command = "mkdir -p \${path.module}/.octo-outputs && octo run-action --resourceId=subnet-region-private-subnet > \${path.module}/.octo-outputs/subnet-region-private-subnet.json"
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
         command = "mkdir -p \${path.module}/.octo-outputs && octo run-action --resourceId=vpc-region > \${path.module}/.octo-outputs/vpc-region.json"
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

    const result = await testModuleContainer.commit(app, {
      filterByModuleIds: ['execution'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
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
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appUpdateDeployment } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appUpdateDeployment)).toMatchSnapshot();
    const resultUpdateDeployment = await testModuleContainer.commit(appUpdateDeployment, {});
    expect(testModuleContainer.digestDiffs(resultUpdateDeployment.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appUpdateDeploymentRevert } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appUpdateDeploymentRevert)).toMatchSnapshot();
    const resultUpdateDeploymentRevert = await testModuleContainer.commit(appUpdateDeploymentRevert, {});
    expect(testModuleContainer.digestDiffs(resultUpdateDeploymentRevert.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appUpdateDesiredCount } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appUpdateDesiredCount)).toMatchSnapshot();
    const resultUpdateDesiredCount = await testModuleContainer.commit(appUpdateDesiredCount, {});
    expect(testModuleContainer.digestDiffs(resultUpdateDesiredCount.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appAddFilesystem } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appAddFilesystem)).toMatchSnapshot();
    const resultAddFilesystem = await testModuleContainer.commit(appAddFilesystem);
    expect(testModuleContainer.digestDiffs(resultAddFilesystem.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appAddSecurityGroupRule } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appAddSecurityGroupRule)).toMatchSnapshot();
    const resultAddSecurityGroupRule = await testModuleContainer.commit(appAddSecurityGroupRule, {});
    expect(testModuleContainer.digestDiffs(resultAddSecurityGroupRule.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
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
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/security-group=sec-grp-SecurityGroup-backend",
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
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
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateDeployment } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
      });
      expect(await testModuleContainer.diffHcl(appUpdateDeployment)).toMatchSnapshot();
      const resultUpdateDeployment = await testModuleContainer.commit(appUpdateDeployment, {});
      expect(testModuleContainer.digestDiffs(resultUpdateDeployment.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       ]
      `);
    });

    it('should handle desiredCount change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateDesiredCount } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
      });
      expect(await testModuleContainer.diffHcl(appUpdateDesiredCount)).toMatchSnapshot();
      const resultUpdateDesiredCount = await testModuleContainer.commit(appUpdateDesiredCount, {});
      expect(testModuleContainer.digestDiffs(resultUpdateDesiredCount.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       ]
      `);
    });

    it('should handle executionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateExecutionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
      });
      expect(await testModuleContainer.diffHcl(appUpdateExecutionId)).toMatchSnapshot();
      const resultUpdateExecutionId = await testModuleContainer.commit(appUpdateExecutionId, {});
      expect(testModuleContainer.digestDiffs(resultUpdateExecutionId.resourceDiffs)).toMatchInlineSnapshot(`
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
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsExecutionModule>({
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
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });
});
