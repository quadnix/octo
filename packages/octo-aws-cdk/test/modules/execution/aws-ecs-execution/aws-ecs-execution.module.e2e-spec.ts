import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import type { AwsEcsClusterAnchorSchema } from '../../../../src/anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import type { AwsEcsTaskDefinitionAnchorSchema } from '../../../../src/anchors/aws-ecs/aws-ecs-task-definition.anchor.schema.js';
import type { AwsEfsAnchorSchema } from '../../../../src/anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsIamRoleAnchorSchema } from '../../../../src/anchors/aws-iam/aws-iam-role.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-region.anchor.schema.js';
import type { AwsSecurityGroupAnchorSchema } from '../../../../src/anchors/aws-security-group/aws-security-group.anchor.schema.js';
import type { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../../src/anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import type { AwsSubnetAnchorSchema } from '../../../../src/anchors/aws-subnet/aws-subnet.anchor.schema.js';
import { AwsEcsExecutionModule } from '../../../../src/modules/execution/aws-ecs-execution/index.js';
import { EcsClusterSchema } from '../../../../src/resources/ecs-cluster/index.schema.js';
import { EfsSchema } from '../../../../src/resources/efs/index.schema.js';
import { EfsMountTargetSchema } from '../../../../src/resources/efs-mount-target/index.schema.js';
import { IamRoleSchema } from '../../../../src/resources/iam-role/index.schema.js';
import { SubnetSchema } from '../../../../src/resources/subnet/index.schema.js';
import { VpcSchema } from '../../../../src/resources/vpc/index.schema.js';
import { TerragruntRunner } from '../../../../src/utilities/terragrunt-runner/terragrunt-runner.utility.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

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
    account: [`aws,${AWS_ACCOUNT_ID}`],
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
      awsAccountId: AWS_ACCOUNT_ID,
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
        awsAccountId: AWS_ACCOUNT_ID,
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
        properties: { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: 'us-east-1', clusterName: 'region-qa' },
        resourceContext: '@octo/ecs-cluster=ecs-cluster-region-qa',
        response: { clusterArn: 'clusterArn' },
        schema: EcsClusterSchema,
      },
      {
        properties: { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: 'us-east-1', filesystemName: 'test-filesystem' },
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
        schema: EfsSchema,
      },
      {
        properties: { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: 'us-east-1' },
        resourceContext: '@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem',
        response: { MountTargetId: 'MountTargetId', NetworkInterfaceId: 'NetworkInterfaceId' },
        schema: EfsMountTargetSchema,
      },
      {
        properties: { awsAccountId: AWS_ACCOUNT_ID, policies: [], rolename: 'iam-role-ServerRole-backend' },
        resourceContext: '@octo/iam-role=iam-role-ServerRole-backend',
        response: { Arn: 'Arn', RoleId: 'RoleId', RoleName: 'iam-role-ServerRole-backend' },
        schema: IamRoleSchema,
      },
      {
        properties: {
          AvailabilityZone: 'us-east-1a',
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/8',
          subnetName: 'private-subnet',
        },
        resourceContext: '@octo/subnet=subnet-region-private-subnet',
        response: { SubnetId: 'SubnetId' },
        schema: SubnetSchema,
      },
      {
        properties: {
          awsAccountId: AWS_ACCOUNT_ID,
          awsAvailabilityZones: ['us-east-1a'],
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/24',
          InstanceTenancy: 'default',
        },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
        schema: VpcSchema,
      },
    ],
    { save: true },
  );

  return { account, app, deployment, environment, filesystem, region, server, subnet };
}

describe('AwsEcsExecutionModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate terragrunt that validates and plans against AWS', async () => {
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

    const { outputDir } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    const runner = new TerragruntRunner(outputDir, { awsRegion: AWS_REGION_ID });
    await runner.validate();
    await runner.plan();
  }, 300_000);
});
