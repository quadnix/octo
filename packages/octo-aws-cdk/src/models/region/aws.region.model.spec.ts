import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { AwsRegion, OctoAwsCdkPackageMock, RegionId } from '../../index.js';
import type { IEfsResponse } from '../../resources/efs/efs.interface.js';
import type { IInternetGatewayResponse } from '../../resources/internet-gateway/internet-gateway.interface.js';
import type { ISecurityGroupResponse } from '../../resources/security-group/security-group.interface.js';
import type { IVpcResponse } from '../../resources/vpc/vpc.interface.js';

describe('AwsRegion UT', () => {
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
          'efs-aws-us-east-1a-shared-mounts': {
            response: <Partial<IEfsResponse>>{
              FileSystemArn: 'FileSystemArn',
              FileSystemId: 'FileSystemId',
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

    it('should create new region and delete it', async () => {
      // Add region.
      const app = new App('test');
      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "vpc=vpc-aws-us-east-1a",
             "value": "vpc-aws-us-east-1a",
           },
         ],
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "internet-gateway=igw-aws-us-east-1a",
             "value": "igw-aws-us-east-1a",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "security-group=sec-grp-aws-us-east-1a-access",
             "value": "sec-grp-aws-us-east-1a-access",
           },
         ],
       ]
      `);

      // Add a new filesystem.
      await region.addFilesystem('shared-mounts');
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "efs=efs-aws-us-east-1a-shared-mounts",
             "value": "efs-aws-us-east-1a-shared-mounts",
           },
         ],
       ]
      `);

      // Remove the "shared-mounts" filesystem.
      await region.removeFilesystem('shared-mounts');
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "efs=efs-aws-us-east-1a-shared-mounts",
             "value": "efs-aws-us-east-1a-shared-mounts",
           },
         ],
       ]
      `);

      // Remove region.
      region.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "internet-gateway=igw-aws-us-east-1a",
             "value": "igw-aws-us-east-1a",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "security-group=sec-grp-aws-us-east-1a-access",
             "value": "sec-grp-aws-us-east-1a-access",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "vpc=vpc-aws-us-east-1a",
             "value": "vpc-aws-us-east-1a",
           },
         ],
       ]
      `);
    });
  });
});
