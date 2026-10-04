import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModuleContainer } from '@quadnix/octo';
import { AwsCloudFrontInvalidationServiceModule } from '../../../src/modules/service/aws-cloudfront-invalidation-service/index.js';
import {
  ECS_US_EAST_1,
  SERVERLESS_US_EAST_1,
  albModule,
  appModules,
  bucketModule,
  countByType,
  createStackTestModuleContainer,
  distributionModule,
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
  testModule,
} from '../../utilities/stack.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-distributions');
const WEBSITE_SOURCE_PATH = join(__dirname, '../../../resources/s3-static-website');

describe('Multiple distributions E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan two distributions serving one ALB, and one of them a second ALB', async () => {
    const { name } = ECS_US_EAST_1;
    const api = { moduleId: `alb-qa-api-${name}`, nodeName: 'service', originId: 'api' } as const;
    const admin = { moduleId: `alb-qa-admin-${name}`, nodeName: 'service', originId: 'admin' } as const;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-distributions'),
        ...ecsRegionModules(ECS_US_EAST_1),
        ecsPrivateSubnetModule(ECS_US_EAST_1),
        ecsEnvironmentModule(name, 'qa'),
        serverModule('backend'),
        ecsDeploymentModule('backend', 'v1'),
        ecsExecutionModule({
          deployment: 'backend-v1',
          environment: 'qa',
          executionId: 'backend-v1-qa',
          regionName: name,
          subnet: 'private',
        }),
        albModule(name, 'qa-api', [{ executionId: 'backend-v1-qa', targetGroupName: 'api-v1-80' }]),
        albModule(name, 'qa-admin', [{ executionId: 'backend-v1-qa', targetGroupName: 'admin-v1-80' }]),
        distributionModule('octo-multiple-distributions-api', [api]),
        distributionModule('octo-multiple-distributions-all', [api, admin]),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_cloudfront_distribution": 2,
       "aws_ecs_cluster": 1,
       "aws_ecs_service": 1,
       "aws_ecs_task_definition": 1,
       "aws_eip": 1,
       "aws_iam_role": 1,
       "aws_iam_role_policy_attachment": 1,
       "aws_internet_gateway": 1,
       "aws_lb": 2,
       "aws_lb_listener": 2,
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
  }, 1_800_000);

  it('should plan two distributions serving one bucket and one function, each invalidated', async () => {
    const { name } = SERVERLESS_US_EAST_1;
    const site = {
      moduleId: 'bucket-octo-multiple-distributions-site',
      nodeName: 'service',
      originId: 'site',
    } as const;
    const functionOrigin = (serverKey: string) =>
      ({ moduleId: `execution-${serverKey}-v1-qa-${name}`, nodeName: 'execution', originId: serverKey }) as const;
    const distributions = [
      {
        distributionName: 'octo-multiple-distributions-qa',
        origins: [site, functionOrigin('backend'), functionOrigin('worker')],
      },
      { distributionName: 'octo-multiple-distributions-prod', origins: [site, functionOrigin('backend')] },
    ];
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-distributions'),
        ...serverlessRegionModules(SERVERLESS_US_EAST_1),
        serverlessEnvironmentModule(name, 'qa'),
        bucketModule(name, 'octo-multiple-distributions-site', { directoryPath: WEBSITE_SOURCE_PATH }),
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
        ...distributions.flatMap(({ distributionName, origins }) => [
          distributionModule(distributionName, origins),
          testModule(AwsCloudFrontInvalidationServiceModule, `invalidation-${distributionName}`, {
            cloudFront: ref(`distribution-${distributionName}`, 'service'),
            source: ref(site.moduleId, 'service'),
          }),
        ]),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_cloudfront_distribution": 2,
       "aws_cloudfront_origin_access_control": 5,
       "aws_ecr_repository": 2,
       "aws_iam_role": 2,
       "aws_lambda_function": 2,
       "aws_lambda_function_url": 2,
       "aws_lambda_permission": 4,
       "aws_s3_bucket": 1,
       "aws_s3_bucket_policy": 1,
       "aws_s3_bucket_public_access_block": 1,
       "aws_s3_object": 3,
       "null_resource": 4,
     }
    `);
  }, 1_800_000);
});
