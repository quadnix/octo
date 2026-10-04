import { rm } from 'node:fs/promises';
import {
  type AModule,
  type Account,
  type App,
  type Constructable,
  type Deployment,
  type Environment,
  type Execution,
  type Filesystem,
  type HclBlock,
  HclUtility,
  type Image,
  type ModuleSchemaInputs,
  type Region,
  type Server,
  type Service,
  type Subnet,
  SubnetType,
  TestContainer,
  type TestModule,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsSecurityGroupAnchorRuleSchema } from '../../src/anchors/aws-security-group/aws-security-group.anchor.schema.js';
import { AwsIniAccountModule } from '../../src/modules/account/aws-ini-account/index.js';
import { SimpleAppModule } from '../../src/modules/app/simple-app/index.js';
import { AwsDeploymentModule } from '../../src/modules/deployment/aws-deployment/index.js';
import { AwsEcsEnvironmentModule } from '../../src/modules/environment/aws-ecs-environment/index.js';
import { AwsServerlessEnvironmentModule } from '../../src/modules/environment/aws-serverless-environment/index.js';
import { AwsEcsExecutionModule } from '../../src/modules/execution/aws-ecs-execution/index.js';
import { AwsLambdaExecutionModule } from '../../src/modules/execution/aws-lambda-execution/index.js';
import { AwsEfsFilesystemModule } from '../../src/modules/filesystem/aws-efs-filesystem/index.js';
import { AwsEcrImageModule } from '../../src/modules/image/aws-ecr-image/index.js';
import { AwsEcrImageTagModule } from '../../src/modules/image/aws-ecr-image-tag/index.js';
import { AwsMultiAzRegionModule } from '../../src/modules/region/aws-multi-az-region/index.js';
import { AwsMultiAzRegionId } from '../../src/modules/region/aws-multi-az-region/index.schema.js';
import { AwsServerlessRegionModule } from '../../src/modules/region/aws-serverless-region/index.js';
import { AwsServerlessRegionId } from '../../src/modules/region/aws-serverless-region/index.schema.js';
import { AwsServerModule } from '../../src/modules/server/aws-server/index.js';
import { AwsCloudFrontServiceModule } from '../../src/modules/service/aws-cloudfront-service/index.js';
import { AwsDynamoDBServiceModule } from '../../src/modules/service/aws-dynamodb-service/index.js';
import { AwsEcsAlbServiceModule } from '../../src/modules/service/aws-ecs-alb-service/index.js';
import { AwsS3StorageServiceModule } from '../../src/modules/service/aws-s3-storage-service/index.js';
import { AwsServerlessSubnetModule } from '../../src/modules/subnet/aws-serverless-subnet/index.js';
import { AwsSimpleSubnetModule } from '../../src/modules/subnet/aws-simple-subnet/index.js';
import { config } from '../test.config.js';

/*
 * Building blocks for the e2es that compose real modules into a stack and plan it with terraform,
 * to find what breaks when something is built more than once.
 *
 * Every builder names its module by a fixed convention, so that one builder's module can be handed
 * to another by id: `region-<region>`, `subnet-<subnet>-<region>`, `environment-<environment>-<region>`,
 * `filesystem-<filesystem>-<region>`, `table-<table>-<region>`, `bucket-<bucket>`, `alb-<alb>-<region>`,
 * `server-<server>`, `deployment-<server>-<tag>`, `execution-<executionId>-<region>`, `image-<image>`,
 * `image-tag-<image>-<tag with dashes for dots>` and `distribution-<distribution>`.
 */

const { AWS_ACCOUNT_ID } = config;

export type AnyModule = AModule<unknown, any>;

/**
 * An octo region of the ECS stack, over two availability zones.
 */
export type EcsRegion = {
  awsAvailabilityZones: [string, string];
  name: string;
  regionIds: [AwsMultiAzRegionId, AwsMultiAzRegionId];
  vpcCidrPrefix: string;
};

/**
 * An octo region of the serverless stack.
 */
export type ServerlessRegion = {
  name: string;
  regionId: AwsServerlessRegionId;
};

export const ECS_US_EAST_1: EcsRegion = {
  awsAvailabilityZones: ['us-east-1a', 'us-east-1b'],
  name: 'east',
  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
  vpcCidrPrefix: '10.0',
};

export const SERVERLESS_US_EAST_1: ServerlessRegion = { name: 'east', regionId: AwsServerlessRegionId.AWS_US_EAST_1 };

/**
 * Egress to anywhere, and HTTP from anywhere.
 */
export const OPEN_HTTP_RULES: AwsSecurityGroupAnchorRuleSchema[] = [
  { CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 80, IpProtocol: 'tcp', ToPort: 80 },
  { CidrBlock: '0.0.0.0/0', Egress: true, FromPort: 0, IpProtocol: 'tcp', ToPort: 65535 },
];

/**
 * The model of each node name a module can create.
 */
type Models = {
  account: Account;
  app: App;
  deployment: Deployment;
  environment: Environment;
  execution: Execution;
  filesystem: Filesystem;
  image: Image;
  region: Region;
  server: Server;
  service: Service;
  subnet: Subnet;
};

/**
 * A stub of the model the given module created, e.g. `ref('region-east', 'region')`.
 */
export function ref<N extends keyof Models>(moduleId: string, nodeName: N): Models[N] {
  return stub<Models[N]>(`\${{${moduleId}.model.${nodeName}}}`);
}

/**
 * A module to load, typed by the module's own inputs.
 */
export function testModule<M extends AnyModule>(
  type: Constructable<M>,
  moduleId: string,
  inputs: ModuleSchemaInputs<M>,
): TestModule<AnyModule> {
  return { inputs, moduleId, type } as TestModule<AnyModule>;
}

/**
 * Counts the terraform resources of each type, e.g. `{ aws_lb: 2 }`. Two resources merged into one,
 * or one dropped, shows up as a count one short.
 */
export function countByType(addresses: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const address of addresses) {
    const type = address.split('.')[0];
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * A container with a terraform provider for each given AWS region of the test account, and the
 * output folder emptied, since generate writes only the folders of its own modules and a previous
 * test's folders would be planned too.
 */
export async function createStackTestModuleContainer(
  awsRegionIds: string[],
  outputDir: string,
): Promise<TestModuleContainer> {
  const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

  const testModuleContainer = new TestModuleContainer(container);
  await testModuleContainer.initialize();

  testModuleContainer.registerTerraformConfig({
    providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
  });
  for (const awsRegionId of awsRegionIds) {
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, awsRegionId);
  }

  await rm(outputDir, { force: true, recursive: true });

  return testModuleContainer;
}

/**
 * Composes and generates the given modules, and plans them with terraform against real AWS, applying
 * nothing. Returns the rendered terraform resources by address.
 */
export async function planStack(
  testModuleContainer: TestModuleContainer,
  modules: TestModule<AnyModule>[],
  outputDir: string,
): Promise<Record<string, HclBlock>> {
  const { hclRender } = (await testModuleContainer.runModules(modules, { outputDir, terraformTarget: 'plan' }).next())
    .value!;
  return HclUtility.parse(hclRender).resource;
}

/**
 * An app and the one AWS account it runs in.
 */
export function appModules(appName: string): TestModule<AnyModule>[] {
  return [
    testModule(SimpleAppModule, 'app', { name: appName }),
    testModule(AwsIniAccountModule, 'account', { accountId: AWS_ACCOUNT_ID, app: ref('app', 'app') }),
  ];
}

/**
 * An ECS region, the given filesystems in it, and two public subnets, `public` holding the NAT
 * gateway and `public-backup`, one in each availability zone.
 *
 * Modules run in the order of their types, so the filesystems come before the first subnet: a
 * subnet mounting a filesystem resolves it when every subnet runs.
 */
export function ecsRegionModules(
  region: EcsRegion,
  { filesystems = [] }: { filesystems?: string[] } = {},
): TestModule<AnyModule>[] {
  const [azA, azB] = region.awsAvailabilityZones;
  return [
    testModule(AwsMultiAzRegionModule, `region-${region.name}`, {
      account: ref('account', 'account'),
      name: region.name,
      regionIds: region.regionIds,
      vpcCidrBlock: `${region.vpcCidrPrefix}.0.0/16`,
    }),
    ...filesystems.map((filesystemName) =>
      testModule(AwsEfsFilesystemModule, `filesystem-${filesystemName}-${region.name}`, {
        filesystemName,
        region: ref(`region-${region.name}`, 'region'),
      }),
    ),
    testModule(AwsSimpleSubnetModule, `subnet-public-${region.name}`, {
      region: ref(`region-${region.name}`, 'region'),
      subnetAvailabilityZone: azA,
      subnetCidrBlock: `${region.vpcCidrPrefix}.0.0/24`,
      subnetName: 'public',
      subnetOptions: { createNatGateway: true, disableSubnetIntraNetwork: false, subnetType: SubnetType.PUBLIC },
    }),
    testModule(AwsSimpleSubnetModule, `subnet-public-backup-${region.name}`, {
      region: ref(`region-${region.name}`, 'region'),
      subnetAvailabilityZone: azB,
      subnetCidrBlock: `${region.vpcCidrPrefix}.1.0/24`,
      subnetName: 'public-backup',
      subnetOptions: { createNatGateway: false, disableSubnetIntraNetwork: false, subnetType: SubnetType.PUBLIC },
    }),
  ];
}

/**
 * A private subnet of an ECS region, reaching out through the `public` subnet's NAT gateway, and
 * mounting the given filesystems.
 */
export function ecsPrivateSubnetModule(
  region: EcsRegion,
  {
    availabilityZoneIndex = 0,
    cidrIndex = 2,
    filesystems = [],
    subnetName = 'private',
  }: { availabilityZoneIndex?: 0 | 1; cidrIndex?: number; filesystems?: string[]; subnetName?: string } = {},
): TestModule<AnyModule> {
  return testModule(AwsSimpleSubnetModule, `subnet-${subnetName}-${region.name}`, {
    localFilesystems: filesystems.map((f) => ref(`filesystem-${f}-${region.name}`, 'filesystem')),
    region: ref(`region-${region.name}`, 'region'),
    subnetAvailabilityZone: region.awsAvailabilityZones[availabilityZoneIndex],
    subnetCidrBlock: `${region.vpcCidrPrefix}.${cidrIndex}.0/24`,
    subnetName,
    subnetOptions: { createNatGateway: false, disableSubnetIntraNetwork: true, subnetType: SubnetType.PRIVATE },
    subnetSiblings: [{ attachToNatGateway: true, subnet: ref(`subnet-public-${region.name}`, 'subnet') }],
  });
}

/**
 * A serverless region and its one subnet.
 */
export function serverlessRegionModules(region: ServerlessRegion): TestModule<AnyModule>[] {
  return [
    testModule(AwsServerlessRegionModule, `region-${region.name}`, {
      account: ref('account', 'account'),
      name: region.name,
      regionId: region.regionId,
    }),
    testModule(AwsServerlessSubnetModule, `subnet-default-${region.name}`, {
      region: ref(`region-${region.name}`, 'region'),
    }),
  ];
}

/**
 * An ECS environment in the given region.
 */
export function ecsEnvironmentModule(regionName: string, environmentName: string): TestModule<AnyModule> {
  return testModule(AwsEcsEnvironmentModule, `environment-${environmentName}-${regionName}`, {
    environmentName,
    environmentVariables: { NODE_ENV: environmentName },
    region: ref(`region-${regionName}`, 'region'),
  });
}

/**
 * A serverless environment in the given region.
 */
export function serverlessEnvironmentModule(regionName: string, environmentName: string): TestModule<AnyModule> {
  return testModule(AwsServerlessEnvironmentModule, `environment-${environmentName}-${regionName}`, {
    environmentName,
    environmentVariables: { NODE_ENV: environmentName },
    region: ref(`region-${regionName}`, 'region'),
  });
}

/**
 * A table keyed by `recordId`, billed per request.
 */
export function tableModule(regionName: string, tableName: string): TestModule<AnyModule> {
  return testModule(AwsDynamoDBServiceModule, `table-${tableName}-${regionName}`, {
    AttributeDefinitions: [{ AttributeName: 'recordId', AttributeType: 'S' }],
    billingMode: { settings: {}, type: 'PAY_PER_REQUEST' },
    KeySchema: [{ AttributeName: 'recordId', KeyType: 'HASH' }],
    region: ref(`region-${regionName}`, 'region'),
    TableName: tableName,
  });
}

/**
 * A bucket in the given region, with any other inputs given.
 */
export function bucketModule(
  regionName: string,
  bucketName: string,
  inputs: Partial<ModuleSchemaInputs<AwsS3StorageServiceModule>> = {},
): TestModule<AnyModule> {
  return testModule(AwsS3StorageServiceModule, `bucket-${bucketName}`, {
    bucketName,
    region: ref(`region-${regionName}`, 'region'),
    ...inputs,
  });
}

/**
 * A server in the one account, with any other inputs given, such as its grants.
 */
export function serverModule(
  serverKey: string,
  inputs: Partial<ModuleSchemaInputs<AwsServerModule>> = {},
): TestModule<AnyModule> {
  return testModule(AwsServerModule, `server-${serverKey}`, {
    account: ref('account', 'account'),
    serverKey,
    ...inputs,
  });
}

/**
 * A deployment ECS runs, of a public image serving HTTP on port 80.
 */
export function ecsDeploymentModule(serverKey: string, deploymentTag: string): TestModule<AnyModule> {
  return testModule(AwsDeploymentModule, `deployment-${serverKey}-${deploymentTag}`, {
    command: ['node', 'webserver'],
    cpu: 256,
    deploymentTag,
    imageUri: 'docker.io/ealen/echo-server:0.9.2',
    memory: 512,
    ports: [{ containerPort: 80, protocol: 'tcp' }],
    server: ref(`server-${serverKey}`, 'server'),
  });
}

/**
 * A deployment ECS runs beside another as a sidecar, with no resources of its own.
 */
export function ecsSidecarDeploymentModule(serverKey: string, deploymentTag: string): TestModule<AnyModule> {
  return testModule(AwsDeploymentModule, `deployment-${serverKey}-${deploymentTag}`, {
    command: ['/fluent-bit/bin/fluent-bit'],
    deploymentTag,
    imageUri: 'docker.io/fluent/fluent-bit:3.0',
    server: ref(`server-${serverKey}`, 'server'),
  });
}

/**
 * An ECS execution of a deployment, given by `<server>-<tag>`, with sidecars given the same way.
 */
export function ecsExecutionModule({
  deployment,
  environment,
  executionId,
  filesystems = [],
  regionName,
  sidecars = [],
  subnet,
}: {
  deployment: string;
  environment: string;
  executionId: string;
  filesystems?: string[];
  regionName: string;
  sidecars?: string[];
  subnet: string;
}): TestModule<AnyModule> {
  return testModule(AwsEcsExecutionModule, `execution-${executionId}-${regionName}`, {
    deployments: {
      main: {
        containerProperties: { image: { essential: true, name: 'main' } },
        deployment: ref(`deployment-${deployment}`, 'deployment'),
      },
      sidecars: sidecars.map((sidecar) => ({
        containerProperties: { image: { essential: false, name: sidecar } },
        deployment: ref(`deployment-${sidecar}`, 'deployment'),
      })),
    },
    desiredCount: 1,
    environment: ref(`environment-${environment}-${regionName}`, 'environment'),
    executionId,
    filesystems: filesystems.map((f) => ref(`filesystem-${f}-${regionName}`, 'filesystem')),
    securityGroupRules: OPEN_HTTP_RULES,
    subnet: ref(`subnet-${subnet}-${regionName}`, 'subnet'),
  });
}

/**
 * An ALB in an ECS region's public subnets, listening on port 80 and splitting traffic evenly
 * across a target group for each given execution's main container.
 */
export function albModule(
  regionName: string,
  albName: string,
  targets: { executionId: string; targetGroupName: string }[],
): TestModule<AnyModule> {
  return testModule(AwsEcsAlbServiceModule, `alb-${albName}-${regionName}`, {
    albName,
    listeners: [
      {
        DefaultActions: [
          {
            action: {
              TargetGroups: targets.map((t) => ({
                targetGroupName: t.targetGroupName,
                Weight: Math.floor(100 / targets.length),
              })),
            },
            actionType: 'forward',
          },
        ],
        Port: 80,
        rules: [],
      },
    ],
    region: ref(`region-${regionName}`, 'region'),
    subnets: [ref(`subnet-public-${regionName}`, 'subnet'), ref(`subnet-public-backup-${regionName}`, 'subnet')],
    targets: targets.map((t) => ({
      containerName: 'main',
      containerPort: 80,
      execution: ref(`execution-${t.executionId}-${regionName}`, 'execution'),
      healthCheck: {
        HealthCheckIntervalSeconds: 30,
        HealthCheckPath: '/',
        HealthCheckPort: 80,
        HealthCheckProtocol: 'HTTP',
        HealthCheckTimeoutSeconds: 5,
        HealthyThresholdCount: 2,
        Matcher: { HttpCode: 200 },
        UnhealthyThresholdCount: 2,
      },
      Name: t.targetGroupName,
    })),
  });
}

/**
 * An image published into the given regions.
 */
export function imageModule(imageName: string, regionNames: string[]): TestModule<AnyModule> {
  return testModule(AwsEcrImageModule, `image-${imageName}`, {
    imageFamily: 'stack',
    imageName,
    regions: regionNames.map((r) => ref(`region-${r}`, 'region')),
  });
}

/**
 * A tag of the given image, built for arm64.
 */
export function imageTagModule(imageName: string, imageTag: string): TestModule<AnyModule> {
  // A module id cannot hold a dot, so `0.0.1` is written `0-0-1`.
  return testModule(AwsEcrImageTagModule, `image-tag-${imageName}-${imageTag.replaceAll('.', '-')}`, {
    architecture: 'arm64',
    dockerfileDirectory: 'images/backend',
    image: ref(`image-${imageName}`, 'image'),
    imageTag,
  });
}

/**
 * A deployment Lambda runs, of a tag of a published image, which must share the server's name.
 */
export function lambdaDeploymentModule(
  serverKey: string,
  deploymentTag: string,
  imageTag: string,
): TestModule<AnyModule> {
  return testModule(AwsDeploymentModule, `deployment-${serverKey}-${deploymentTag}`, {
    deploymentTag,
    image: ref(`image-${serverKey}`, 'image'),
    imageTag,
    memory: 512,
    ports: [{ containerPort: 8080, protocol: 'tcp' }],
    server: ref(`server-${serverKey}`, 'server'),
    timeoutInSeconds: 30,
  });
}

/**
 * A Lambda execution of a deployment, given by `<server>-<tag>`, in a serverless region's subnet.
 */
export function lambdaExecutionModule({
  deployment,
  environment,
  executionId,
  regionName,
}: {
  deployment: string;
  environment: string;
  executionId: string;
  regionName: string;
}): TestModule<AnyModule> {
  return testModule(AwsLambdaExecutionModule, `execution-${executionId}-${regionName}`, {
    deployment: ref(`deployment-${deployment}`, 'deployment'),
    environment: ref(`environment-${environment}-${regionName}`, 'environment'),
    executionId,
    subnet: ref(`subnet-default-${regionName}`, 'subnet'),
  });
}

/**
 * A distribution serving each given origin, the first at the default route and every other under
 * `/<originId>/*`. An origin's source is the id of the module whose model it is, and that model's
 * node name: `service` for a bucket or ALB, `execution` for a function.
 */
export function distributionModule(
  distributionName: string,
  origins: { moduleId: string; nodeName: 'execution' | 'service'; originId: string }[],
): TestModule<AnyModule> {
  return testModule(AwsCloudFrontServiceModule, `distribution-${distributionName}`, {
    account: ref('account', 'account'),
    defaultRootObject: 'index.html',
    distributionName,
    origins: origins.map((o) => ({ originId: o.originId, source: ref(o.moduleId, o.nodeName) })),
    priceClass: 'PriceClass_100',
    routes: origins.map((o, index) => ({
      originId: o.originId,
      pathPattern: index === 0 ? null : `/${o.originId}/*`,
    })),
  });
}
