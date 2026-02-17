import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import {
  CreateServiceCommand,
  DeleteTaskDefinitionsCommand,
  DescribeServicesCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
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
import { mockClient } from 'aws-sdk-client-mock';
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
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
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
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

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
        response: { Arn: 'Arn', policies: {}, RoleId: 'RoleId', RoleName: 'iam-role-ServerRole-backend' },
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
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const EC2ClientMock = mockClient(EC2Client);
  const ECSClientMock = mockClient(ECSClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    EC2ClientMock.on(CreateSecurityGroupCommand)
      .resolves({ GroupId: 'GroupId' })
      .on(AuthorizeSecurityGroupEgressCommand)
      .resolves({ SecurityGroupRules: [{ SecurityGroupRuleId: 'SecurityGroupRuleId-Egress' }] })
      .on(AuthorizeSecurityGroupIngressCommand)
      .resolves({ SecurityGroupRules: [{ SecurityGroupRuleId: 'SecurityGroupRuleId-Ingress' }] })
      .on(DescribeSecurityGroupsCommand)
      .resolves({ SecurityGroups: [] });

    ECSClientMock.on(RegisterTaskDefinitionCommand)
      .resolves({
        taskDefinition: {
          revision: 1,
          taskDefinitionArn: 'arn:aws:ecs:us-east-1:123:task-definition/family:1',
        },
      })
      .on(CreateServiceCommand)
      .resolves({
        service: {
          serviceArn: 'arn:aws:ecs:us-east-1:123:service/cluster/service-name',
          serviceName: 'service-name',
        },
      })
      .on(UpdateServiceCommand)
      .resolves({
        service: {
          serviceArn: 'arn:aws:ecs:us-east-1:123:service/cluster/service-name',
          serviceName: 'service-name',
        },
      })
      .on(DescribeServicesCommand)
      .resolves({ services: [] })
      .on(DeleteTaskDefinitionsCommand)
      .resolves({ failures: [] });

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: EC2Client,
            value: EC2ClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ECSClient,
            value: ECSClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0, throwOnError: true });
    });
  });

  afterEach(async () => {
    EC2ClientMock.reset();
    ECSClientMock.reset();
    ResourceGroupsTaggingAPIClientMock.reset();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
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
         "AddSecurityGroupResourceAction",
         "AddSecurityGroupResourceAction",
         "AddEcsTaskDefinitionResourceAction",
       ],
       [
         "AddEcsServiceResourceAction",
       ],
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend",
           "value": "@octo/security-group=sec-grp-SecurityGroup-backend",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           "value": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
         },
       ],
       [],
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
    const resultUpdateDeployment = await testModuleContainer.commit(appUpdateDeployment, {
      enableResourceCapture: true,
    });
    expect(resultUpdateDeployment.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": "",
         },
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "",
         },
       ],
       [],
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
    const resultUpdateDeploymentRevert = await testModuleContainer.commit(appUpdateDeploymentRevert, {
      enableResourceCapture: true,
    });
    expect(resultUpdateDeploymentRevert.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": "",
         },
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "",
         },
       ],
       [],
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
    const resultUpdateDesiredCount = await testModuleContainer.commit(appUpdateDesiredCount, {
      enableResourceCapture: true,
    });
    expect(resultUpdateDesiredCount.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "",
         },
       ],
       [],
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
    const resultAddFilesystem = await testModuleContainer.commit(appAddFilesystem, { enableResourceCapture: true });
    expect(resultAddFilesystem.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": "",
         },
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "",
         },
       ],
       [],
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
    const resultAddSecurityGroupRule = await testModuleContainer.commit(appAddSecurityGroupRule, {
      enableResourceCapture: true,
    });
    expect(resultAddSecurityGroupRule.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           "value": {
             "key": "rules",
             "value": [
               {
                 "CidrBlock": "10.0.0.0/8",
                 "Egress": true,
                 "FromPort": 8080,
                 "IpProtocol": "tcp",
                 "ToPort": 8080,
               },
             ],
           },
         },
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "",
         },
       ],
       [],
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend",
           "value": "@octo/security-group=sec-grp-SecurityGroup-backend",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           "value": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend",
           "value": "@octo/security-group=sec-grp-SecurityGroup-backend",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           "value": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
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
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
       ],
       [],
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
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
       ],
       [],
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

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
      const resultUpdateDeployment = await testModuleContainer.commit(appUpdateDeployment, {
        enableResourceCapture: true,
      });
      expect(resultUpdateDeployment.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "resourceId",
             "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
             "value": "",
           },
           {
             "action": "update",
             "field": "resourceId",
             "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
             "value": "",
           },
         ],
         [],
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

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
      const resultUpdateDesiredCount = await testModuleContainer.commit(appUpdateDesiredCount, {
        enableResourceCapture: true,
      });
      expect(resultUpdateDesiredCount.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "resourceId",
             "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
             "value": "",
           },
         ],
         [],
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

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
      const resultUpdateExecutionId = await testModuleContainer.commit(appUpdateExecutionId, {
        enableResourceCapture: true,
      });
      expect(resultUpdateExecutionId.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
             "value": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
             "value": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
             "value": "@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
             "value": "@octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/ecs-task-definition=ecs-task-definition-changed-execution-id",
             "value": "@octo/ecs-task-definition=ecs-task-definition-changed-execution-id",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/ecs-service=ecs-service-changed-execution-id",
             "value": "@octo/ecs-service=ecs-service-changed-execution-id",
           },
         ],
         [],
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
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

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
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
