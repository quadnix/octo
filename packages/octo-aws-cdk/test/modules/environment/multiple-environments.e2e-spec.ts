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
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-environments');

describe('Multiple environments E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan one ECS deployment executed in two environments of one region', async () => {
    const { name } = ECS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-environments'),
        ...ecsRegionModules(ECS_US_EAST_1),
        ecsPrivateSubnetModule(ECS_US_EAST_1),
        ecsEnvironmentModule(name, 'qa'),
        ecsEnvironmentModule(name, 'prod'),
        serverModule('backend'),
        ecsDeploymentModule('backend', 'v1'),
        ...['qa', 'prod'].map((environment) =>
          ecsExecutionModule({
            deployment: 'backend-v1',
            environment,
            executionId: `backend-v1-${environment}`,
            regionName: name,
            subnet: 'private',
          }),
        ),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecs_cluster": 2,
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

  it('should plan one Lambda deployment executed in two environments of one region', async () => {
    const { name } = SERVERLESS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-environments'),
        ...serverlessRegionModules(SERVERLESS_US_EAST_1),
        serverlessEnvironmentModule(name, 'qa'),
        serverlessEnvironmentModule(name, 'prod'),
        imageModule('backend', [name]),
        imageTagModule('backend', '0.0.1'),
        serverModule('backend'),
        lambdaDeploymentModule('backend', 'v1', '0.0.1'),
        ...['qa', 'prod'].map((environment) =>
          lambdaExecutionModule({
            deployment: 'backend-v1',
            environment,
            executionId: `backend-v1-${environment}`,
            regionName: name,
          }),
        ),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecr_repository": 1,
       "aws_iam_role": 2,
       "aws_lambda_function": 2,
       "aws_lambda_function_url": 2,
       "null_resource": 1,
     }
    `);
  }, 1_800_000);
});
