import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModule, type TestModuleContainer } from '@quadnix/octo';
import { AwsServerAccessPermission } from '../../../src/modules/server/aws-server/index.schema.js';
import {
  type AnyModule,
  ECS_US_EAST_1,
  SERVERLESS_US_EAST_1,
  appModules,
  bucketModule,
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
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-grants');

/**
 * Two tables and two buckets, one of them granting two prefixes, in the given region, and the
 * `backend` server granted all of them.
 */
function grantedServerModules(regionName: string): TestModule<AnyModule>[] {
  return [
    tableModule(regionName, 'accounts'),
    tableModule(regionName, 'orders'),
    bucketModule(regionName, 'octo-multiple-grants-uploads', { accessPrefixes: ['images', 'videos'] }),
    bucketModule(regionName, 'octo-multiple-grants-reports', { accessPrefixes: ['daily'] }),
    serverModule('backend', {
      dynamodb: ['accounts', 'orders'].map((tableName) => ({
        access: AwsServerAccessPermission.READ_WRITE,
        service: ref(`table-${tableName}-${regionName}`, 'service'),
      })),
      s3: [
        {
          accessPrefixes: [
            { access: AwsServerAccessPermission.READ, accessPrefix: 'images' },
            { access: AwsServerAccessPermission.READ_WRITE, accessPrefix: 'videos' },
          ],
          service: ref('bucket-octo-multiple-grants-uploads', 'service'),
        },
        {
          accessPrefixes: [{ access: AwsServerAccessPermission.WRITE, accessPrefix: 'daily' }],
          service: ref('bucket-octo-multiple-grants-reports', 'service'),
        },
      ],
    }),
  ];
}

describe('Multiple grants E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan an ECS execution of a server granted two tables and two buckets', async () => {
    const { name } = ECS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-grants'),
        ...ecsRegionModules(ECS_US_EAST_1),
        ecsPrivateSubnetModule(ECS_US_EAST_1),
        ecsEnvironmentModule(name, 'qa'),
        ...grantedServerModules(name),
        ecsDeploymentModule('backend', 'v1'),
        ecsExecutionModule({
          deployment: 'backend-v1',
          environment: 'qa',
          executionId: 'backend-v1-qa',
          regionName: name,
          subnet: 'private',
        }),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_dynamodb_table": 2,
       "aws_ecs_cluster": 1,
       "aws_ecs_service": 1,
       "aws_ecs_task_definition": 1,
       "aws_eip": 1,
       "aws_iam_policy": 5,
       "aws_iam_role": 1,
       "aws_iam_role_policy_attachment": 6,
       "aws_internet_gateway": 1,
       "aws_nat_gateway": 1,
       "aws_network_acl": 3,
       "aws_route_table": 3,
       "aws_route_table_association": 3,
       "aws_s3_bucket": 2,
       "aws_s3_bucket_policy": 2,
       "aws_s3_bucket_public_access_block": 2,
       "aws_security_group": 1,
       "aws_subnet": 3,
       "aws_vpc": 1,
       "aws_vpc_security_group_egress_rule": 1,
       "aws_vpc_security_group_ingress_rule": 1,
     }
    `);
  }, 1_800_000);

  it('should plan a Lambda execution of a server granted two tables and two buckets', async () => {
    const { name } = SERVERLESS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-grants'),
        ...serverlessRegionModules(SERVERLESS_US_EAST_1),
        serverlessEnvironmentModule(name, 'qa'),
        ...grantedServerModules(name),
        imageModule('backend', [name]),
        imageTagModule('backend', '0.0.1'),
        lambdaDeploymentModule('backend', 'v1', '0.0.1'),
        lambdaExecutionModule({
          deployment: 'backend-v1',
          environment: 'qa',
          executionId: 'backend-v1-qa',
          regionName: name,
        }),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_dynamodb_table": 2,
       "aws_ecr_repository": 1,
       "aws_iam_policy": 5,
       "aws_iam_role": 1,
       "aws_iam_role_policy_attachment": 5,
       "aws_lambda_function": 1,
       "aws_lambda_function_url": 1,
       "aws_s3_bucket": 2,
       "aws_s3_bucket_policy": 2,
       "aws_s3_bucket_public_access_block": 2,
       "null_resource": 1,
     }
    `);
  }, 1_800_000);
});
