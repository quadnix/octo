import { App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AwsEnvironment, AwsRegion, OctoAwsCdkPackageMock, RegionId } from '../../index.js';
import type { IEcsClusterResponse } from '../../resources/ecs/ecs-cluster.interface.js';
import type { IInternetGatewayResponse } from '../../resources/internet-gateway/internet-gateway.interface.js';
import type { ISecurityGroupResponse } from '../../resources/security-group/security-group.interface.js';
import type { IVpcResponse } from '../../resources/vpc/vpc.interface.js';

describe('Environment UT', () => {
  const stateProvider = new TestStateProvider();

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

    let app: App;
    let region: AwsRegion;

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {
          'ecs-cluster-aws-us-east-1a-qa': {
            response: <Partial<IEcsClusterResponse>>{
              clusterArn: 'clusterArn',
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
      await testModuleContainer.initialize(stateProvider);

      // Add region.
      app = new App('test');
      region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should add environment', async () => {
      // Commit state with app and region.
      await testModuleContainer.commit(app);

      const environment = new AwsEnvironment('qa');
      region.addEnvironment(environment);

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "ecs-cluster=ecs-cluster-aws-us-east-1a-qa",
             "value": "ecs-cluster-aws-us-east-1a-qa",
           },
         ],
       ]
      `);
    });

    it('should remove environment', async () => {
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "ecs-cluster=ecs-cluster-aws-us-east-1a-qa",
             "value": "ecs-cluster-aws-us-east-1a-qa",
           },
         ],
       ]
      `);
    });
  });
});
