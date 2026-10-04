import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModuleContainer } from '@quadnix/octo';
import {
  ECS_US_EAST_1,
  appModules,
  countByType,
  createStackTestModuleContainer,
  ecsDeploymentModule,
  ecsEnvironmentModule,
  ecsExecutionModule,
  ecsPrivateSubnetModule,
  ecsRegionModules,
  planStack,
  serverModule,
} from '../../utilities/stack.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-filesystems');

describe('Multiple filesystems E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan two filesystems mounted in one subnet, and one of them in a second subnet', async () => {
    const { name } = ECS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-filesystems'),
        ...ecsRegionModules(ECS_US_EAST_1, { filesystems: ['shared', 'logs'] }),
        ecsPrivateSubnetModule(ECS_US_EAST_1, { filesystems: ['shared', 'logs'] }),
        ecsPrivateSubnetModule(ECS_US_EAST_1, {
          availabilityZoneIndex: 1,
          cidrIndex: 3,
          filesystems: ['shared'],
          subnetName: 'private-backup',
        }),
        ecsEnvironmentModule(name, 'qa'),
        serverModule('backend'),
        ecsDeploymentModule('backend', 'v1'),
        ecsExecutionModule({
          deployment: 'backend-v1',
          environment: 'qa',
          executionId: 'backend-v1-qa',
          filesystems: ['shared', 'logs'],
          regionName: name,
          subnet: 'private',
        }),
        ecsExecutionModule({
          deployment: 'backend-v1',
          environment: 'qa',
          executionId: 'backend-v1-qa-backup',
          filesystems: ['shared'],
          regionName: name,
          subnet: 'private-backup',
        }),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecs_cluster": 1,
       "aws_ecs_service": 2,
       "aws_ecs_task_definition": 2,
       "aws_efs_backup_policy": 2,
       "aws_efs_file_system": 2,
       "aws_efs_mount_target": 3,
       "aws_eip": 1,
       "aws_iam_role": 2,
       "aws_iam_role_policy_attachment": 2,
       "aws_internet_gateway": 1,
       "aws_nat_gateway": 1,
       "aws_network_acl": 4,
       "aws_route_table": 4,
       "aws_route_table_association": 4,
       "aws_security_group": 5,
       "aws_subnet": 4,
       "aws_vpc": 1,
       "aws_vpc_security_group_egress_rule": 2,
       "aws_vpc_security_group_ingress_rule": 5,
     }
    `);
  }, 1_800_000);
});
