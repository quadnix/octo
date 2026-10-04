import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModule, type TestModuleContainer } from '@quadnix/octo';
import { AwsMultiAzRegionId } from '../../../src/modules/region/aws-multi-az-region/index.schema.js';
import { AwsServerlessRegionId } from '../../../src/modules/region/aws-serverless-region/index.schema.js';
import { AwsServerAccessPermission } from '../../../src/modules/server/aws-server/index.schema.js';
import {
  type AnyModule,
  ECS_US_EAST_1,
  type EcsRegion,
  type ServerlessRegion,
  albModule,
  appModules,
  countByType,
  createStackTestModuleContainer,
  ecsDeploymentModule,
  ecsEnvironmentModule,
  ecsExecutionModule,
  ecsPrivateSubnetModule,
  ecsRegionModules,
  imageModule,
  imageTagModule,
  lambdaDeploymentModule,
  lambdaExecutionModule,
  planStack,
  ref,
  serverModule,
  serverlessEnvironmentModule,
  serverlessRegionModules,
  tableModule,
} from '../../utilities/stack.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-regions');

/**
 * An octo region of the ECS stack, with the names its ALB, target group, table and execution take.
 */
type EcsStackRegion = EcsRegion & { albName: string; executionId: string; tableName: string; targetGroupName: string };

/**
 * An octo region of the serverless stack, with the names its table and execution take.
 */
type ServerlessStackRegion = ServerlessRegion & { executionId: string; tableName: string };

/**
 * An ECS stack in the given octo regions. Each region gets the `qa` environment, a filesystem mounted
 * in its private subnet, a table, an execution of the one `backend` server's `v1` deployment mounting
 * the filesystem, and an ALB in front of it. The server may read and write every region's table.
 */
function ecsStackModules(regions: EcsStackRegion[]): TestModule<AnyModule>[] {
  const modules = appModules('multiple-regions');

  for (const region of regions) {
    modules.push(
      ...ecsRegionModules(region, { filesystems: ['shared'] }),
      ecsEnvironmentModule(region.name, 'qa'),
      ecsPrivateSubnetModule(region, { filesystems: ['shared'] }),
      tableModule(region.name, region.tableName),
    );
  }

  modules.push(
    serverModule('backend', {
      dynamodb: regions.map((region) => ({
        access: AwsServerAccessPermission.READ_WRITE,
        service: ref(`table-${region.tableName}-${region.name}`, 'service'),
      })),
    }),
    ecsDeploymentModule('backend', 'v1'),
  );

  for (const region of regions) {
    modules.push(
      ecsExecutionModule({
        deployment: 'backend-v1',
        environment: 'qa',
        executionId: region.executionId,
        filesystems: ['shared'],
        regionName: region.name,
        subnet: 'private',
      }),
      albModule(region.name, region.albName, [
        { executionId: region.executionId, targetGroupName: region.targetGroupName },
      ]),
    );
  }

  return modules;
}

/**
 * A serverless stack in the given regions. The `backend` image is published into every region, and
 * each region gets the `qa` environment, a table, and a Lambda execution of the one `backend` server's
 * `v1` deployment. The server may read and write every region's table.
 */
function serverlessStackModules(regions: ServerlessStackRegion[]): TestModule<AnyModule>[] {
  const modules = appModules('multiple-regions');

  for (const region of regions) {
    modules.push(
      ...serverlessRegionModules(region),
      serverlessEnvironmentModule(region.name, 'qa'),
      tableModule(region.name, region.tableName),
    );
  }

  modules.push(
    imageModule(
      'backend',
      regions.map((region) => region.name),
    ),
    imageTagModule('backend', '0.0.1'),
    serverModule('backend', {
      dynamodb: regions.map((region) => ({
        access: AwsServerAccessPermission.READ_WRITE,
        service: ref(`table-${region.tableName}-${region.name}`, 'service'),
      })),
    }),
    lambdaDeploymentModule('backend', 'v1', '0.0.1'),
  );

  for (const region of regions) {
    modules.push(
      lambdaExecutionModule({
        deployment: 'backend-v1',
        environment: 'qa',
        executionId: region.executionId,
        regionName: region.name,
      }),
    );
  }

  return modules;
}

const EAST: EcsStackRegion = {
  ...ECS_US_EAST_1,
  albName: 'qa-api-alb',
  executionId: 'backend-v1-qa-east',
  tableName: 'accounts',
  targetGroupName: 'backend-v1-80',
};
const WEST: EcsStackRegion = {
  albName: 'qa-api-alb',
  awsAvailabilityZones: ['us-west-2a', 'us-west-2b'],
  executionId: 'backend-v1-qa-west',
  name: 'west',
  regionIds: [AwsMultiAzRegionId.AWS_US_WEST_2A, AwsMultiAzRegionId.AWS_US_WEST_2B],
  tableName: 'accounts',
  targetGroupName: 'backend-v1-80',
  vpcCidrPrefix: '10.1',
};
const EAST_SECOND: EcsStackRegion = {
  albName: 'qa-api-alb-second',
  awsAvailabilityZones: ['us-east-1c', 'us-east-1d'],
  executionId: 'backend-v1-qa-east-second',
  name: 'east-second',
  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1C, AwsMultiAzRegionId.AWS_US_EAST_1D],
  tableName: 'accounts-second',
  targetGroupName: 'backend-v1-80-second',
  vpcCidrPrefix: '10.1',
};

describe('Multiple regions E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1', 'us-west-2'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  describe('two AWS regions', () => {
    it('should refuse one execution id in both regions', async () => {
      await expect(
        planStack(testModuleContainer, ecsStackModules([EAST, { ...WEST, executionId: EAST.executionId }]), OUTPUT_DIR),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlay already exists!"`);
    }, 300_000);

    it('should plan an ECS stack built under the same names in both regions', async () => {
      const resource = await planStack(testModuleContainer, ecsStackModules([EAST, WEST]), OUTPUT_DIR);
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
      const resource = await planStack(
        testModuleContainer,
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
        OUTPUT_DIR,
      );
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
      expect(names.filter((n) => n === 'stack/backend')).toHaveLength(2);
    }, 1_800_000);
  });

  describe('two octo regions in one AWS region', () => {
    it('should refuse one table name in both regions', async () => {
      await expect(
        planStack(
          testModuleContainer,
          ecsStackModules([EAST, { ...EAST_SECOND, tableName: EAST.tableName }]),
          OUTPUT_DIR,
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `""TableName" "accounts" is not unique within awsAccountId, awsRegionId: resource "@octo/dynamodb=dynamodb-accounts-a97b32" of module "table-accounts-east" and resource "@octo/dynamodb=dynamodb-accounts-ddca89" of module "table-accounts-east-second" both use it!"`,
      );
    }, 300_000);

    it('should refuse one ALB name in both regions', async () => {
      await expect(
        planStack(testModuleContainer, ecsStackModules([EAST, { ...EAST_SECOND, albName: EAST.albName }]), OUTPUT_DIR),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `""Name" "qa-api-alb" is not unique within awsAccountId, awsRegionId: resource "@octo/alb=alb-qa-api-alb-91e44d" of module "alb-qa-api-alb-east" and resource "@octo/alb=alb-qa-api-alb-1dc9d3" of module "alb-qa-api-alb-east-second" both use it!"`,
      );
    }, 300_000);

    it('should plan an ECS stack whose regions name their own ALB, target group and table', async () => {
      const resource = await planStack(testModuleContainer, ecsStackModules([EAST, EAST_SECOND]), OUTPUT_DIR);
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
