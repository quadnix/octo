import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModuleContainer } from '@quadnix/octo';
import {
  ECS_US_EAST_1,
  albModule,
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
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-load-balancers');

describe('Multiple load balancers E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan two ALBs in one region, one with two target groups, and one execution behind both', async () => {
    const { name } = ECS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-load-balancers'),
        ...ecsRegionModules(ECS_US_EAST_1),
        ecsPrivateSubnetModule(ECS_US_EAST_1),
        ecsEnvironmentModule(name, 'qa'),
        serverModule('backend'),
        ...['v1', 'v2'].flatMap((tag) => [
          ecsDeploymentModule('backend', tag),
          ecsExecutionModule({
            deployment: `backend-${tag}`,
            environment: 'qa',
            executionId: `backend-${tag}-qa`,
            regionName: name,
            subnet: 'private',
          }),
        ]),
        albModule(name, 'qa-api', [
          { executionId: 'backend-v1-qa', targetGroupName: 'api-v1-80' },
          { executionId: 'backend-v2-qa', targetGroupName: 'api-v2-80' },
        ]),
        albModule(name, 'qa-admin', [{ executionId: 'backend-v1-qa', targetGroupName: 'admin-v1-80' }]),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecs_cluster": 1,
       "aws_ecs_service": 2,
       "aws_ecs_task_definition": 2,
       "aws_eip": 1,
       "aws_iam_role": 2,
       "aws_iam_role_policy_attachment": 2,
       "aws_internet_gateway": 1,
       "aws_lb": 2,
       "aws_lb_listener": 2,
       "aws_lb_target_group": 3,
       "aws_nat_gateway": 1,
       "aws_network_acl": 3,
       "aws_route_table": 3,
       "aws_route_table_association": 3,
       "aws_security_group": 4,
       "aws_subnet": 3,
       "aws_vpc": 1,
       "aws_vpc_security_group_egress_rule": 4,
       "aws_vpc_security_group_ingress_rule": 4,
     }
    `);
  }, 1_800_000);
});
