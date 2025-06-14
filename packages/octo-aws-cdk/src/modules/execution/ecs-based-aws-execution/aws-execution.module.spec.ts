import { EC2Client } from '@aws-sdk/client-ec2';
import { ECSClient } from '@aws-sdk/client-ecs';
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
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { EcsClusterAnchorSchema } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.schema.js';
import type { EcsTaskDefinitionAnchorSchema } from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import type { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import type { IamRoleAnchorSchema } from '../../../anchors/iam-role/iam-role.anchor.schema.js';
import type { SecurityGroupAnchorSchema } from '../../../anchors/security-group/security-group.anchor.schema.js';
import type { SubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.schema.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import type { EcsServiceSchema } from '../../../resources/ecs-service/index.schema.js';
import type { EcsTaskDefinitionSchema } from '../../../resources/ecs-task-definition/index.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.schema.js';
import type { IamRoleSchema } from '../../../resources/iam-role/index.schema.js';
import type { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsExecutionModule } from './index.js';

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
    testModuleContainer.createTestAnchor<EcsTaskDefinitionAnchorSchema>(
      'EcsTaskDefinitionAnchor',
      {
        cpu: 256,
        image: { command: '/bin/sh', ports: [{ containerPort: 8080, protocol: 'tcp' }], uri: 'docker.io' },
        memory: 512,
      },
      deployment,
    ),
  );
  environment.addAnchor(
    testModuleContainer.createTestAnchor<EcsClusterAnchorSchema>(
      'EcsClusterAnchor',
      { clusterName: 'region-qa', environmentVariables: { NODE_ENV: 'qa' } },
      environment,
    ),
  );
  const efsFilesystemAnchor = testModuleContainer.createTestAnchor<EfsFilesystemAnchorSchema>(
    'EfsFilesystemAnchor',
    { filesystemName: 'test-filesystem' },
    filesystem,
  );
  filesystem.addAnchor(efsFilesystemAnchor);
  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a' },
      region,
    ),
  );
  server.addAnchor(
    testModuleContainer.createTestAnchor<IamRoleAnchorSchema>(
      'IamRoleAnchor',
      { iamRoleName: 'iam-role-ServerRole-backend' },
      server,
    ),
  );
  server.addAnchor(
    testModuleContainer.createTestAnchor<SecurityGroupAnchorSchema>(
      'SecurityGroupAnchor',
      { rules: [], securityGroupName: 'SecurityGroup-backend' },
      server,
    ),
  );
  const subnetLocalFilesystemMountAnchor = testModuleContainer.createTestAnchor<SubnetLocalFilesystemMountAnchorSchema>(
    `SubnetLocalFilesystemMountAnchor-${filesystem.filesystemName}`,
    {
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      filesystemName: filesystem.filesystemName,
      subnetName: 'private-subnet',
    },
    subnet,
  );
  subnet.addAnchor(subnetLocalFilesystemMountAnchor);

  await testModuleContainer.createTestOverlays('testModule', [
    {
      anchors: [efsFilesystemAnchor, subnetLocalFilesystemMountAnchor],
      // eslint-disable-next-line max-len
      context: `@octo/subnet-local-filesystem-mount-overlay=subnet-local-filesystem-mount-overlay-${subnet.subnetName}-${filesystem.filesystemName}`,
      properties: {
        filesystemName: filesystem.filesystemName,
        regionId: region.regionId,
        subnetId: subnet.subnetId,
        subnetName: subnet.subnetName,
      },
    },
  ]);

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

describe('AwsExecutionModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: EC2Client,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
          {
            metadata: { package: '@octo' },
            type: ECSClient,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0 });
    });

    // Register resource captures.
    testModuleContainer.registerCapture<SecurityGroupSchema>('@octo/security-group=sec-grp-SecurityGroup-backend', {
      GroupId: 'GroupId-1',
      Rules: { egress: [], ingress: [] },
    });
    testModuleContainer.registerCapture<SecurityGroupSchema>(
      '@octo/security-group=sec-grp-SecurityGroup-backend-v1-region-qa-private-subnet',
      {
        GroupId: 'GroupId-2',
        Rules: { egress: [], ingress: [] },
      },
    );
    testModuleContainer.registerCapture<EcsTaskDefinitionSchema>(
      '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-private-subnet',
      {
        revision: 1,
        taskDefinitionArn: 'taskDefinitionArn',
      },
    );
    testModuleContainer.registerCapture<EcsServiceSchema>(
      '@octo/ecs-service=ecs-service-backend-v1-region-qa-private-subnet',
      {
        serviceArn: 'serviceArn',
      },
    );
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['execution'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddExecutionModelAction",
       ],
       [
         "AddSecurityGroupOverlayAction",
       ],
       [
         "AddExecutionOverlayAction",
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
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app3 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app4 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });
    const result4 = await testModuleContainer.commit(app4, { enableResourceCapture: true });
    expect(result4.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app5 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });
    const result5 = await testModuleContainer.commit(app5, { enableResourceCapture: true });
    expect(result5.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app6 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsExecutionModule>({
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
      type: AwsExecutionModule,
    });
    const result6 = await testModuleContainer.commit(app6, { enableResourceCapture: true });
    expect(result6.resourceDiffs).toMatchInlineSnapshot(`
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

    const { app: app7 } = await setup(testModuleContainer);
    const result7 = await testModuleContainer.commit(app7, { enableResourceCapture: true });
    expect(result7.resourceDiffs).toMatchInlineSnapshot(`
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
});
