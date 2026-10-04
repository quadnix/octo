import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModuleContainer } from '@quadnix/octo';
import {
  ECS_US_EAST_1,
  SERVERLESS_US_EAST_1,
  appModules,
  countByType,
  createStackTestModuleContainer,
  ecsDeploymentModule,
  ecsEnvironmentModule,
  ecsExecutionModule,
  ecsPrivateSubnetModule,
  ecsRegionModules,
  ecsSidecarDeploymentModule,
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
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-servers');

/*
 * Two servers executed in one environment and subnet.
 */
describe('Multiple servers E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan two ECS servers in one environment and subnet, sharing one sidecar', async () => {
    const { name } = ECS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-servers'),
        ...ecsRegionModules(ECS_US_EAST_1),
        ecsPrivateSubnetModule(ECS_US_EAST_1),
        ecsEnvironmentModule(name, 'qa'),
        serverModule('logger'),
        ecsSidecarDeploymentModule('logger', 'v1'),
        ...['backend', 'worker'].flatMap((serverKey) => [
          serverModule(serverKey),
          ecsDeploymentModule(serverKey, 'v1'),
          ecsExecutionModule({
            deployment: `${serverKey}-v1`,
            environment: 'qa',
            executionId: `${serverKey}-v1-qa`,
            regionName: name,
            sidecars: ['logger-v1'],
            subnet: 'private',
          }),
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
       "aws_nat_gateway": 1,
       "aws_network_acl": 3,
       "aws_route_table": 3,
       "aws_route_table_association": 3,
       "aws_security_group": 2,
       "aws_subnet": 3,
       "aws_vpc": 1,
       "aws_vpc_security_group_egress_rule": 2,
       "aws_vpc_security_group_ingress_rule": 2,
     }
    `);
  }, 1_800_000);

  it('should plan two Lambda servers in one environment', async () => {
    const { name } = SERVERLESS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-servers'),
        ...serverlessRegionModules(SERVERLESS_US_EAST_1),
        serverlessEnvironmentModule(name, 'qa'),
        ...['backend', 'worker'].flatMap((serverKey) => [
          imageModule(serverKey, [name]),
          imageTagModule(serverKey, '0.0.1'),
          serverModule(serverKey),
          lambdaDeploymentModule(serverKey, 'v1', '0.0.1'),
          lambdaExecutionModule({
            deployment: `${serverKey}-v1`,
            environment: 'qa',
            executionId: `${serverKey}-v1-qa`,
            regionName: name,
          }),
        ]),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecr_repository": 2,
       "aws_iam_role": 2,
       "aws_lambda_function": 2,
       "aws_lambda_function_url": 2,
       "null_resource": 2,
     }
    `);
  }, 1_800_000);
});
