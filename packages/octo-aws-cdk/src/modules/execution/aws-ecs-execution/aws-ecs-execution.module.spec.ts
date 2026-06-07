import {
  type Account,
  type App,
  type Deployment,
  DiffAssert,
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
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.schema.js';
import type { IamRoleSchema } from '../../../resources/iam-role/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsEcsExecutionModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
  octoTerraform: OctoTerraform,
): Promise<{
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

  const {
    '@octo/ecs-cluster=ecs-cluster-region-qa': ecsClusterResource,
    '@octo/efs=efs-region-test-filesystem': efsResource,
    '@octo/iam-role=iam-role-ServerRole-backend': iamRoleResource,
    '@octo/subnet=subnet-region-private-subnet': subnetResource,
    '@octo/vpc=vpc-region': vpcResource,
  } = await testModuleContainer.createTestResources<
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

  const ecsClusterOctoResource = octoTerraform.addOctoTerraformResource(ecsClusterResource);
  ecsClusterOctoResource.output({
    clusterArn: octoTerraform.raw('mock.clusterArn'),
  });
  const efsOctoResource = octoTerraform.addOctoTerraformResource(efsResource);
  efsOctoResource.output({
    FileSystemId: octoTerraform.raw('mock.FileSystemId'),
  });
  const iamRoleOctoResource = octoTerraform.addOctoTerraformResource(iamRoleResource);
  iamRoleOctoResource.output({
    Arn: octoTerraform.raw('mock.Arn'),
  });
  const subnetOctoResource = octoTerraform.addOctoTerraformResource(subnetResource);
  subnetOctoResource.output({
    SubnetId: octoTerraform.raw('mock.SubnetId'),
  });
  const vpcOctoResource = octoTerraform.addOctoTerraformResource(vpcResource);
  vpcOctoResource.output({
    VpcId: octoTerraform.raw('mock.VpcId'),
  });

  return { account, app, deployment, environment, filesystem, region, server, subnet };
}

describe('AwsEcsExecutionModule UT', () => {
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

    hcl = new HclAssert(octoTerraform);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer, octoTerraform);
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
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
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
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureSecurityGroupResponseResourceAction",
         "CaptureSecurityGroupResponseResourceAction",
         "CaptureEcsTaskDefinitionResponseResourceAction",
       ],
       [
         "CaptureEcsServiceResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
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

     output "ecs-cluster-region-qa-clusterArn" {
       value = mock.clusterArn
     }

     output "efs-region-test-filesystem-FileSystemId" {
       value = mock.FileSystemId
     }

     output "iam-role-ServerRole-backend-Arn" {
       value = mock.Arn
     }

     output "subnet-region-private-subnet-SubnetId" {
       value = mock.SubnetId
     }

     output "vpc-region-VpcId" {
       value = mock.VpcId
     }

     resource "aws_security_group" "sec-grp-SecurityGroup-backend" {
       provider = aws.123-us-east-1
       vpc_id = mock.VpcId
     }

     output "sec-grp-SecurityGroup-backend-Arn" {
       value = aws_security_group.sec-grp-SecurityGroup-backend.arn
     }

     output "sec-grp-SecurityGroup-backend-GroupId" {
       value = aws_security_group.sec-grp-SecurityGroup-backend.id
     }

     resource "aws_security_group" "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet" {
       provider = aws.123-us-east-1
       vpc_id = mock.VpcId
     }

     output "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet-Arn" {
       value = aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.arn
     }

     output "sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet-GroupId" {
       value = aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.id
     }

     resource "aws_ecs_task_definition" "ecs-task-definition-backend-v1-region-qa-private-subnet" {
       provider = aws.123-us-east-1
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
       execution_role_arn = mock.Arn
       family = "qa-region-private-subnet-backend"
       memory = "512"
       network_mode = "awsvpc"
       requires_compatibilities = ["FARGATE"]
       task_role_arn = mock.Arn
     }

     output "ecs-task-definition-backend-v1-region-qa-private-subnet-revision" {
       value = aws_ecs_task_definition.ecs-task-definition-backend-v1-region-qa-private-subnet.revision
     }

     output "ecs-task-definition-backend-v1-region-qa-private-subnet-taskDefinitionArn" {
       value = aws_ecs_task_definition.ecs-task-definition-backend-v1-region-qa-private-subnet.arn
     }

     resource "aws_ecs_service" "ecs-service-backend-v1-region-qa-private-subnet" {
       provider = aws.123-us-east-1
       cluster = mock.clusterArn
       desired_count = 1
       launch_type = "FARGATE"
       name = "backend-v1-region-qa-private-subnet"
       network_configuration {
         assign_public_ip = false
         security_groups = [aws_security_group.sec-grp-SecurityGroup-backend.id, aws_security_group.sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet.id]
         subnets = [mock.SubnetId]
       }
       task_definition = aws_ecs_task_definition.ecs-task-definition-backend-v1-region-qa-private-subnet.arn
     }

     output "ecs-service-backend-v1-region-qa-private-subnet-serviceArn" {
       value = aws_ecs_service.ecs-service-backend-v1-region-qa-private-subnet.id
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appUpdateDeployment } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateDeployment = await testModuleContainer.commit(appUpdateDeployment, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultUpdateDeployment.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appUpdateDeploymentRevert } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateDeploymentRevert = await testModuleContainer.commit(appUpdateDeploymentRevert, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultUpdateDeploymentRevert.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appUpdateDesiredCount } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateDesiredCount = await testModuleContainer.commit(appUpdateDesiredCount, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultUpdateDesiredCount.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appAddFilesystem } = await setup(testModuleContainer, octoTerraform);
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
    const resultAddFilesystem = await testModuleContainer.commit(appAddFilesystem, { enableResourceCapture: true });
    expect(new DiffAssert(resultAddFilesystem.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appAddSecurityGroupRule } = await setup(testModuleContainer, octoTerraform);
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
    const resultAddSecurityGroupRule = await testModuleContainer.commit(appAddSecurityGroupRule, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultAddSecurityGroupRule.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer, octoTerraform);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "- @octo/security-group=sec-grp-SecurityGroup-backend",
       "- @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "- @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-SecurityGroup-backend",
       "+ @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "+ @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/security-group=sec-grp-SecurityGroup-backend",
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteTags } = await setup(testModuleContainer, octoTerraform);
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
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
       "* @octo/security-group=sec-grp-SecurityGroup-backend",
       "* @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle deployment change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateDeployment } = await setup(testModuleContainer, octoTerraform);
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
      const resultUpdateDeployment = await testModuleContainer.commit(appUpdateDeployment, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateDeployment.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle desiredCount change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateDesiredCount } = await setup(testModuleContainer, octoTerraform);
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
      const resultUpdateDesiredCount = await testModuleContainer.commit(appUpdateDesiredCount, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateDesiredCount.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle executionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateExecutionId } = await setup(testModuleContainer, octoTerraform);
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
      const resultUpdateExecutionId = await testModuleContainer.commit(appUpdateExecutionId, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateExecutionId.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "- @octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         "- @octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
         "- @octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
         "+ @octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
         "+ @octo/ecs-task-definition=ecs-task-definition-changed-execution-id",
         "+ @octo/ecs-service=ecs-service-changed-execution-id",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });
});
