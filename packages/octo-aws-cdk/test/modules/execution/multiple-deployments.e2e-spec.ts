import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModuleContainer } from '@quadnix/octo';
import {
  ECS_US_EAST_1,
  SERVERLESS_US_EAST_1,
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
  serverModule,
  serverlessEnvironmentModule,
  serverlessRegionModules,
} from '../../utilities/stack.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-deployments');

/*
 * Two deployments of one server running side by side in one environment and subnet, as in a
 * blue/green rollout.
 */
describe('Multiple deployments E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan two ECS deployments of one server side by side behind one ALB', async () => {
    const { name } = ECS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-deployments'),
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
          { executionId: 'backend-v1-qa', targetGroupName: 'backend-v1-80' },
          { executionId: 'backend-v2-qa', targetGroupName: 'backend-v2-80' },
        ]),
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
       "aws_lb": 1,
       "aws_lb_listener": 1,
       "aws_lb_target_group": 2,
       "aws_nat_gateway": 1,
       "aws_network_acl": 3,
       "aws_route_table": 3,
       "aws_route_table_association": 3,
       "aws_security_group": 3,
       "aws_subnet": 3,
       "aws_vpc": 1,
       "aws_vpc_security_group_egress_rule": 3,
       "aws_vpc_security_group_ingress_rule": 3,
     }
    `);

    // ECS keeps a task definition family unique per account and region.
    const families = Object.values(resource)
      .map((block) => block.family)
      .filter(Boolean);
    expect(families).toEqual(['backend-v1-qa', 'backend-v2-qa']);
  }, 1_800_000);

  it('should plan two Lambda deployments of one server side by side, each on its own tag', async () => {
    const { name } = SERVERLESS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-deployments'),
        ...serverlessRegionModules(SERVERLESS_US_EAST_1),
        serverlessEnvironmentModule(name, 'qa'),
        imageModule('backend', [name]),
        serverModule('backend'),
        ...[
          ['v1', '0.0.1'],
          ['v2', '0.0.2'],
        ].flatMap(([tag, imageTag]) => [
          imageTagModule('backend', imageTag),
          lambdaDeploymentModule('backend', tag, imageTag),
          lambdaExecutionModule({
            deployment: `backend-${tag}`,
            environment: 'qa',
            executionId: `backend-${tag}-qa`,
            regionName: name,
          }),
        ]),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecr_repository": 1,
       "aws_iam_role": 2,
       "aws_lambda_function": 2,
       "aws_lambda_function_url": 2,
       "null_resource": 2,
     }
    `);
  }, 1_800_000);
});
