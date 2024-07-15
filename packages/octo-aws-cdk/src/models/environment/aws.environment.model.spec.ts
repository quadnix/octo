import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { AwsEnvironment, AwsRegion, OctoAwsCdkPackageMock, RegionId } from '../../index.js';
import type { IEcsClusterResponse } from '../../resources/ecs/ecs-cluster.interface.js';
import type { IInternetGatewayResponse } from '../../resources/internet-gateway/internet-gateway.interface.js';
import type { ISecurityGroupResponse } from '../../resources/security-group/security-group.interface.js';
import type { IVpcResponse } from '../../resources/vpc/vpc.interface.js';

describe('Environment UT', () => {
  beforeAll(async () => {
    await TestContainer.create(
      {
        importFrom: [OctoAwsCdkPackageMock],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  describe('diff()', () => {
    let testModuleContainer: TestModuleContainer;

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {
          'ecs-cluster-aws-us-east-1a-qa': {
            response: <Partial<IEcsClusterResponse>>{
              ClusterArn: 'ClusterArn',
            },
          },
          'igw-aws-us-east-1a': {
            response: <Partial<IInternetGatewayResponse>>{
              InternetGatewayId: 'InternetGatewayId',
            },
          },
          'sec-grp-aws-us-east-1a-access': {
            response: <Partial<ISecurityGroupResponse>>{
              GroupId: 'GroupId',
              Rules: {
                egress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
                ingress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
              },
            },
          },
          'vpc-aws-us-east-1a': {
            response: <Partial<IVpcResponse>>{
              VpcId: 'VpcId',
            },
          },
        },
        inputs: {
          'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
        },
      });
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should create new environment and delete it', async () => {
      // Add region.
      const app = new App('test');
      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);
      await testModuleContainer.commit(app);

      // Add environment.
      const environment = new AwsEnvironment('qa');
      region.addEnvironment(environment);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "ecs-cluster=ecs-cluster-aws-us-east-1a-qa",
             "value": "ecs-cluster-aws-us-east-1a-qa",
           },
         ],
       ]
      `);

      // Remove environment.
      environment.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "ecs-cluster=ecs-cluster-aws-us-east-1a-qa",
             "value": "ecs-cluster-aws-us-east-1a-qa",
           },
         ],
       ]
      `);
    });
  });
});
