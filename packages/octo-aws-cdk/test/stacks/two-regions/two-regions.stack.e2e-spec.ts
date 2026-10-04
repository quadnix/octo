import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AModule,
  type Account,
  type App,
  type Constructable,
  type Deployment,
  type Environment,
  type Execution,
  type Filesystem,
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
import { AwsIniAccountModule } from '../../../src/modules/account/aws-ini-account/index.js';
import { SimpleAppModule } from '../../../src/modules/app/simple-app/index.js';
import { AwsDeploymentModule } from '../../../src/modules/deployment/aws-deployment/index.js';
import { AwsEcsEnvironmentModule } from '../../../src/modules/environment/aws-ecs-environment/index.js';
import { AwsServerlessEnvironmentModule } from '../../../src/modules/environment/aws-serverless-environment/index.js';
import { AwsEcsExecutionModule } from '../../../src/modules/execution/aws-ecs-execution/index.js';
import { AwsLambdaExecutionModule } from '../../../src/modules/execution/aws-lambda-execution/index.js';
import { AwsEfsFilesystemModule } from '../../../src/modules/filesystem/aws-efs-filesystem/index.js';
import { AwsEcrImageModule } from '../../../src/modules/image/aws-ecr-image/index.js';
import { AwsEcrImageTagModule } from '../../../src/modules/image/aws-ecr-image-tag/index.js';
import { AwsMultiAzRegionModule } from '../../../src/modules/region/aws-multi-az-region/index.js';
import { AwsMultiAzRegionId } from '../../../src/modules/region/aws-multi-az-region/index.schema.js';
import { AwsServerlessRegionModule } from '../../../src/modules/region/aws-serverless-region/index.js';
import { AwsServerlessRegionId } from '../../../src/modules/region/aws-serverless-region/index.schema.js';
import { AwsServerModule } from '../../../src/modules/server/aws-server/index.js';
import { AwsServerAccessPermission } from '../../../src/modules/server/aws-server/index.schema.js';
import { AwsDynamoDBServiceModule } from '../../../src/modules/service/aws-dynamodb-service/index.js';
import { AwsEcsAlbServiceModule } from '../../../src/modules/service/aws-ecs-alb-service/index.js';
import { AwsServerlessSubnetModule } from '../../../src/modules/subnet/aws-serverless-subnet/index.js';
import { AwsSimpleSubnetModule } from '../../../src/modules/subnet/aws-simple-subnet/index.js';
import { config } from '../../test.config.js';

const { AWS_ACCOUNT_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

type AnyModule = AModule<unknown, any>;

/**
 * One octo region of the ECS stack: the region itself, and every module that hangs off it under the
 * same names in each region - the `qa` environment, a filesystem, two public subnets and a private one,
 * and a table.
 */
type EcsRegion = {
  albName: string;
  awsAvailabilityZones: [string, string];
  executionId: string;
  name: string;
  regionIds: [AwsMultiAzRegionId, AwsMultiAzRegionId];
  tableName: string;
  targetGroupName: string;
  vpcCidrPrefix: string;
};

/**
 * One octo region of the serverless stack.
 */
type ServerlessRegion = {
  executionId: string;
  name: string;
  regionId: AwsServerlessRegionId;
  tableName: string;
};

function testModule<M extends AnyModule>(
  type: Constructable<M>,
  moduleId: string,
  inputs: ModuleSchemaInputs<M>,
): TestModule<AnyModule> {
  return { inputs, moduleId, type } as TestModule<AnyModule>;
}

/**
 * The modules every stack starts from: an app and the one AWS account it runs in.
 */
function appModules(): TestModule<AnyModule>[] {
  return [
    testModule(SimpleAppModule, 'app', { name: 'two-regions' }),
    testModule(AwsIniAccountModule, 'account', {
      accountId: AWS_ACCOUNT_ID,
      app: stub<App>('${{app.model.app}}'),
    }),
  ];
}

/**
 * An ECS stack in the given octo regions. Each region gets the same environment, filesystem, subnet
 * names and subnet layout, with the filesystem mounted in the private subnet, a table, an execution of
 * the one `backend` server's `v1` deployment mounting the filesystem, and an ALB forwarding to it
 * through a target group. The server may read and write every region's table.
 */
function ecsStackModules(regions: EcsRegion[]): TestModule<AnyModule>[] {
  const modules = appModules();

  // Each region, with its environment, subnets and table.
  for (const region of regions) {
    const [azA, azB] = region.awsAvailabilityZones;

    modules.push(
      testModule(AwsMultiAzRegionModule, `region-${region.name}`, {
        account: stub<Account>('${{account.model.account}}'),
        name: region.name,
        regionIds: region.regionIds,
        vpcCidrBlock: `${region.vpcCidrPrefix}.0.0/16`,
      }),
      testModule(AwsEcsEnvironmentModule, `qa-environment-${region.name}`, {
        environmentName: 'qa',
        environmentVariables: { NODE_ENV: 'qa' },
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
      }),
      testModule(AwsEfsFilesystemModule, `filesystem-${region.name}`, {
        filesystemName: 'shared',
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
      }),
      testModule(AwsSimpleSubnetModule, `public-subnet-${region.name}`, {
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
        subnetAvailabilityZone: azA,
        subnetCidrBlock: `${region.vpcCidrPrefix}.0.0/24`,
        subnetName: 'public-subnet',
        subnetOptions: { createNatGateway: true, disableSubnetIntraNetwork: false, subnetType: SubnetType.PUBLIC },
      }),
      testModule(AwsSimpleSubnetModule, `public-backup-subnet-${region.name}`, {
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
        subnetAvailabilityZone: azB,
        subnetCidrBlock: `${region.vpcCidrPrefix}.1.0/24`,
        subnetName: 'public-backup-subnet',
        subnetOptions: { createNatGateway: false, disableSubnetIntraNetwork: false, subnetType: SubnetType.PUBLIC },
      }),
      testModule(AwsSimpleSubnetModule, `private-subnet-${region.name}`, {
        localFilesystems: [stub<Filesystem>(`\${{filesystem-${region.name}.model.filesystem}}`)],
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
        subnetAvailabilityZone: azA,
        subnetCidrBlock: `${region.vpcCidrPrefix}.2.0/24`,
        subnetName: 'private-subnet',
        subnetOptions: { createNatGateway: false, disableSubnetIntraNetwork: true, subnetType: SubnetType.PRIVATE },
        subnetSiblings: [
          { attachToNatGateway: true, subnet: stub<Subnet>(`\${{public-subnet-${region.name}.model.subnet}}`) },
          { attachToNatGateway: false, subnet: stub<Subnet>(`\${{public-backup-subnet-${region.name}.model.subnet}}`) },
        ],
      }),
      testModule(AwsDynamoDBServiceModule, `table-${region.name}`, {
        AttributeDefinitions: [{ AttributeName: 'accountId', AttributeType: 'S' }],
        billingMode: { settings: {}, type: 'PAY_PER_REQUEST' },
        KeySchema: [{ AttributeName: 'accountId', KeyType: 'HASH' }],
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
        TableName: region.tableName,
      }),
    );
  }

  // The one server and its deployment.
  modules.push(
    testModule(AwsServerModule, 'backend-server', {
      account: stub<Account>('${{account.model.account}}'),
      dynamodb: regions.map((region) => ({
        access: AwsServerAccessPermission.READ_WRITE,
        service: stub<Service>(`\${{table-${region.name}.model.service}}`),
      })),
      serverKey: 'backend',
    }),
    testModule(AwsDeploymentModule, 'backend-deployment-v1', {
      command: ['node', 'webserver'],
      cpu: 256,
      deploymentTag: 'v1',
      imageUri: 'docker.io/ealen/echo-server:0.9.2',
      memory: 512,
      ports: [{ containerPort: 80, protocol: 'tcp' }],
      server: stub<Server>('${{backend-server.model.server}}'),
    }),
  );

  // Each region's execution, and the ALB in front of it.
  for (const region of regions) {
    modules.push(
      testModule(AwsEcsExecutionModule, `execution-${region.name}`, {
        deployments: {
          main: {
            containerProperties: { image: { essential: true, name: 'backend-v1' } },
            deployment: stub<Deployment>('${{backend-deployment-v1.model.deployment}}'),
          },
          sidecars: [],
        },
        desiredCount: 1,
        environment: stub<Environment>(`\${{qa-environment-${region.name}.model.environment}}`),
        executionId: region.executionId,
        filesystems: [stub<Filesystem>(`\${{filesystem-${region.name}.model.filesystem}}`)],
        securityGroupRules: [
          { CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 80, IpProtocol: 'tcp', ToPort: 80 },
          { CidrBlock: '0.0.0.0/0', Egress: true, FromPort: 0, IpProtocol: 'tcp', ToPort: 65535 },
        ],
        subnet: stub<Subnet>(`\${{private-subnet-${region.name}.model.subnet}}`),
      }),
      testModule(AwsEcsAlbServiceModule, `alb-${region.name}`, {
        albName: region.albName,
        listeners: [
          {
            DefaultActions: [
              {
                action: { TargetGroups: [{ targetGroupName: region.targetGroupName, Weight: 100 }] },
                actionType: 'forward',
              },
            ],
            Port: 80,
            rules: [],
          },
        ],
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
        subnets: [
          stub<Subnet>(`\${{public-subnet-${region.name}.model.subnet}}`),
          stub<Subnet>(`\${{public-backup-subnet-${region.name}.model.subnet}}`),
        ],
        targets: [
          {
            containerName: 'backend-v1',
            containerPort: 80,
            execution: stub<Execution>(`\${{execution-${region.name}.model.execution}}`),
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
            Name: region.targetGroupName,
          },
        ],
      }),
    );
  }

  return modules;
}

/**
 * A serverless stack in the given regions. One image is published into every region, and each region
 * gets the same environment, a table, and a Lambda execution of the one `backend` server's `v1`
 * deployment, which runs that image. The server may read and write every region's table.
 */
function serverlessStackModules(regions: ServerlessRegion[]): TestModule<AnyModule>[] {
  const modules = appModules();

  // Each region, with its environment, subnet and table.
  for (const region of regions) {
    modules.push(
      testModule(AwsServerlessRegionModule, `region-${region.name}`, {
        account: stub<Account>('${{account.model.account}}'),
        name: region.name,
        regionId: region.regionId,
      }),
      testModule(AwsServerlessEnvironmentModule, `qa-environment-${region.name}`, {
        environmentName: 'qa',
        environmentVariables: { NODE_ENV: 'qa' },
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
      }),
      testModule(AwsServerlessSubnetModule, `subnet-${region.name}`, {
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
      }),
      testModule(AwsDynamoDBServiceModule, `table-${region.name}`, {
        AttributeDefinitions: [{ AttributeName: 'accountId', AttributeType: 'S' }],
        billingMode: { settings: {}, type: 'PAY_PER_REQUEST' },
        KeySchema: [{ AttributeName: 'accountId', KeyType: 'HASH' }],
        region: stub<Region>(`\${{region-${region.name}.model.region}}`),
        TableName: region.tableName,
      }),
    );
  }

  // The image, published into every region.
  modules.push(
    testModule(AwsEcrImageModule, 'image', {
      imageFamily: 'two-regions',
      imageName: 'backend',
      regions: regions.map((region) => stub<Region>(`\${{region-${region.name}.model.region}}`)),
    }),
    testModule(AwsEcrImageTagModule, 'image-tag', {
      architecture: 'arm64',
      dockerfileDirectory: 'images/backend',
      image: stub<Image>('${{image.model.image}}'),
      imageTag: '0.0.1',
    }),
  );

  // The one server and its deployment.
  modules.push(
    testModule(AwsServerModule, 'backend-server', {
      account: stub<Account>('${{account.model.account}}'),
      dynamodb: regions.map((region) => ({
        access: AwsServerAccessPermission.READ_WRITE,
        service: stub<Service>(`\${{table-${region.name}.model.service}}`),
      })),
      serverKey: 'backend',
    }),
    testModule(AwsDeploymentModule, 'backend-deployment-v1', {
      deploymentTag: 'v1',
      image: stub<Image>('${{image.model.image}}'),
      imageTag: '0.0.1',
      memory: 512,
      ports: [{ containerPort: 8080, protocol: 'tcp' }],
      server: stub<Server>('${{backend-server.model.server}}'),
      timeoutInSeconds: 30,
    }),
  );

  // Each region's execution.
  for (const region of regions) {
    modules.push(
      testModule(AwsLambdaExecutionModule, `execution-${region.name}`, {
        deployment: stub<Deployment>('${{backend-deployment-v1.model.deployment}}'),
        environment: stub<Environment>(`\${{qa-environment-${region.name}.model.environment}}`),
        executionId: region.executionId,
        subnet: stub<Subnet>(`\${{subnet-${region.name}.model.subnet}}`),
      }),
    );
  }

  return modules;
}

/**
 * Counts the terraform resources of each type, e.g. `{ aws_lb: 2 }`. Two resources merged into one,
 * or one region's dropped, shows up as a count of one.
 */
function countByType(addresses: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const address of addresses) {
    const type = address.split('.')[0];
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const EAST: EcsRegion = {
  albName: 'qa-api-alb',
  awsAvailabilityZones: ['us-east-1a', 'us-east-1b'],
  executionId: 'backend-v1-qa-east',
  name: 'east',
  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
  tableName: 'accounts',
  targetGroupName: 'backend-v1-80',
  vpcCidrPrefix: '10.0',
};
const WEST: EcsRegion = {
  albName: 'qa-api-alb',
  awsAvailabilityZones: ['us-west-2a', 'us-west-2b'],
  executionId: 'backend-v1-qa-west',
  name: 'west',
  regionIds: [AwsMultiAzRegionId.AWS_US_WEST_2A, AwsMultiAzRegionId.AWS_US_WEST_2B],
  tableName: 'accounts',
  targetGroupName: 'backend-v1-80',
  vpcCidrPrefix: '10.1',
};
const EAST_SECOND: EcsRegion = {
  albName: 'qa-api-alb-second',
  awsAvailabilityZones: ['us-east-1c', 'us-east-1d'],
  executionId: 'backend-v1-qa-east-second',
  name: 'east-second',
  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1C, AwsMultiAzRegionId.AWS_US_EAST_1D],
  tableName: 'accounts-second',
  targetGroupName: 'backend-v1-80-second',
  vpcCidrPrefix: '10.1',
};

describe('Two-region stack E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, 'us-east-1');
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, 'us-west-2');

    // Generate writes only the folders of its own modules, so a previous test's folders would be planned too.
    await rm(OUTPUT_DIR, { force: true, recursive: true });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  describe('two AWS regions', () => {
    it('should refuse one execution id in both regions', async () => {
      await expect(
        testModuleContainer
          .runModules(ecsStackModules([EAST, { ...WEST, executionId: EAST.executionId }]), {
            outputDir: OUTPUT_DIR,
            terraformTarget: 'plan',
          })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlay already exists!"`);
    }, 300_000);

    it('should plan an ECS stack built under the same names in both regions', async () => {
      const { hclRender } = (
        await testModuleContainer
          .runModules(ecsStackModules([EAST, WEST]), { outputDir: OUTPUT_DIR, terraformTarget: 'plan' })
          .next()
      ).value!;

      const { resource } = HclUtility.parse(hclRender);
      expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
       {
         "aws_dynamodb_table": 2,
         "aws_ecs_cluster": 2,
         "aws_ecs_service": 2,
         "aws_ecs_task_definition": 2,
         "aws_efs_backup_policy": 2,
         "aws_efs_file_system": 2,
         "aws_efs_mount_target": 2,
         "aws_eip": 2,
         "aws_iam_policy": 4,
         "aws_iam_role": 2,
         "aws_iam_role_policy_attachment": 6,
         "aws_internet_gateway": 2,
         "aws_lb": 2,
         "aws_lb_listener": 2,
         "aws_lb_target_group": 2,
         "aws_nat_gateway": 2,
         "aws_network_acl": 6,
         "aws_route_table": 6,
         "aws_route_table_association": 6,
         "aws_security_group": 6,
         "aws_subnet": 6,
         "aws_vpc": 2,
         "aws_vpc_security_group_egress_rule": 4,
         "aws_vpc_security_group_ingress_rule": 6,
       }
      `);

      // The names AWS keeps unique per account and region are the same in both regions.
      const names = Object.values(resource).map((block) => block.name);
      expect(names.filter((n) => n === 'accounts')).toHaveLength(2);
      expect(names.filter((n) => n === 'qa-api-alb')).toHaveLength(2);
      expect(names.filter((n) => n === 'backend-v1-80')).toHaveLength(2);
    }, 1_800_000);

    it('should plan a serverless stack built under the same names in both regions', async () => {
      const { hclRender } = (
        await testModuleContainer
          .runModules(
            serverlessStackModules([
              {
                executionId: 'backend-v1-qa-east',
                name: 'east',
                regionId: AwsServerlessRegionId.AWS_US_EAST_1,
                tableName: 'accounts',
              },
              {
                executionId: 'backend-v1-qa-west',
                name: 'west',
                regionId: AwsServerlessRegionId.AWS_US_WEST_2,
                tableName: 'accounts',
              },
            ]),
            { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
          )
          .next()
      ).value!;

      const { resource } = HclUtility.parse(hclRender);
      expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
       {
         "aws_dynamodb_table": 2,
         "aws_ecr_repository": 2,
         "aws_iam_policy": 4,
         "aws_iam_role": 2,
         "aws_iam_role_policy_attachment": 4,
         "aws_lambda_function": 2,
         "aws_lambda_function_url": 2,
         "null_resource": 2,
       }
      `);

      const names = Object.values(resource).map((block) => block.name);
      expect(names.filter((n) => n === 'accounts')).toHaveLength(2);
      expect(names.filter((n) => n === 'two-regions/backend')).toHaveLength(2);
    }, 1_800_000);
  });

  describe('two octo regions in one AWS region', () => {
    it('should refuse one table name in both regions', async () => {
      await expect(
        testModuleContainer
          .runModules(ecsStackModules([EAST, { ...EAST_SECOND, tableName: EAST.tableName }]), {
            outputDir: OUTPUT_DIR,
            terraformTarget: 'plan',
          })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `""TableName" "accounts" is not unique within awsAccountId, awsRegionId: resource "@octo/dynamodb=dynamodb-accounts-0c38ec" of module "table-east" and resource "@octo/dynamodb=dynamodb-accounts-4be384" of module "table-east-second" both use it!"`,
      );
    }, 300_000);

    it('should refuse one ALB name in both regions', async () => {
      await expect(
        testModuleContainer
          .runModules(ecsStackModules([EAST, { ...EAST_SECOND, albName: EAST.albName }]), {
            outputDir: OUTPUT_DIR,
            terraformTarget: 'plan',
          })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `""Name" "qa-api-alb" is not unique within awsAccountId, awsRegionId: resource "@octo/alb=alb-qa-api-alb-4418ef" of module "alb-east" and resource "@octo/alb=alb-qa-api-alb-8ca41d" of module "alb-east-second" both use it!"`,
      );
    }, 300_000);

    it('should plan an ECS stack whose regions name their own ALB, target group and table', async () => {
      const { hclRender } = (
        await testModuleContainer
          .runModules(ecsStackModules([EAST, EAST_SECOND]), { outputDir: OUTPUT_DIR, terraformTarget: 'plan' })
          .next()
      ).value!;

      const { resource } = HclUtility.parse(hclRender);
      expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
       {
         "aws_dynamodb_table": 2,
         "aws_ecs_cluster": 2,
         "aws_ecs_service": 2,
         "aws_ecs_task_definition": 2,
         "aws_efs_backup_policy": 2,
         "aws_efs_file_system": 2,
         "aws_efs_mount_target": 2,
         "aws_eip": 2,
         "aws_iam_policy": 4,
         "aws_iam_role": 2,
         "aws_iam_role_policy_attachment": 6,
         "aws_internet_gateway": 2,
         "aws_lb": 2,
         "aws_lb_listener": 2,
         "aws_lb_target_group": 2,
         "aws_nat_gateway": 2,
         "aws_network_acl": 6,
         "aws_route_table": 6,
         "aws_route_table_association": 6,
         "aws_security_group": 6,
         "aws_subnet": 6,
         "aws_vpc": 2,
         "aws_vpc_security_group_egress_rule": 4,
         "aws_vpc_security_group_ingress_rule": 6,
       }
      `);
    }, 1_800_000);
  });
});
