import { App, SubnetType, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AwsRegion, AwsSubnet, OctoAwsCdkPackageMock, RegionId } from '../../index.js';
import type { IEfsMountTargetResponse } from '../../resources/efs/efs-mount-target.interface.js';
import type { IEfsResponse } from '../../resources/efs/efs.interface.js';
import type { IInternetGatewayResponse } from '../../resources/internet-gateway/internet-gateway.interface.js';
import type { INetworkAclResponse } from '../../resources/network-acl/network-acl.interface.js';
import type { IRouteTableResponse } from '../../resources/route-table/route-table.interface.js';
import type { ISecurityGroupResponse } from '../../resources/security-group/security-group.interface.js';
import type { ISubnetResponse } from '../../resources/subnet/subnet.interface.js';
import type { IVpcResponse } from '../../resources/vpc/vpc.interface.js';

describe('AwsSubnet UT', () => {
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

    const TestModule = async ({
      commit = false,
      includeDisablingOfPrivateSubnetIntraNetwork = false,
      includePrivateAndPublicSubnetMounts = false,
      includePrivateAndPublicSubnets = false,
      includePublicConnectToPrivateSubnet = false,
      includePublicDisconnectToPrivateSubnet = false,
    }: Record<string, boolean> = {}): Promise<App> => {
      const app = new App('test');

      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      await region.addFilesystem('shared-mounts');

      if (includePrivateAndPublicSubnets) {
        // Add private subnet.
        const privateSubnet = new AwsSubnet(region, 'private');
        region.addSubnet(privateSubnet);
        // Add public subnet.
        const publicSubnet = new AwsSubnet(region, 'public');
        publicSubnet.subnetType = SubnetType.PUBLIC;
        region.addSubnet(publicSubnet);

        if (includePublicConnectToPrivateSubnet) {
          publicSubnet.updateNetworkingRules(privateSubnet, true);
        }
        if (includePublicDisconnectToPrivateSubnet) {
          publicSubnet.updateNetworkingRules(privateSubnet, false);
        }

        if (includeDisablingOfPrivateSubnetIntraNetwork) {
          privateSubnet.disableSubnetIntraNetwork = true;
        }

        if (includePrivateAndPublicSubnetMounts) {
          await privateSubnet.addFilesystemMount('shared-mounts');
          await publicSubnet.addFilesystemMount('shared-mounts');
        }
      }

      if (commit) {
        await testModuleContainer.commit(app);
      }
      return app;
    };

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {
          'efs-aws-us-east-1a-shared-mounts': {
            response: <Partial<IEfsResponse>>{
              FileSystemArn: 'FileSystemArn',
              FileSystemId: 'FileSystemId',
            },
          },
          'efs-mount-aws-us-east-1a-private-shared-mounts': {
            response: <Partial<IEfsMountTargetResponse>>{
              MountTargetId: 'MountTargetId',
              NetworkInterfaceId: 'NetworkInterfaceId',
            },
          },
          'efs-mount-aws-us-east-1a-public-shared-mounts': {
            response: <Partial<IEfsMountTargetResponse>>{
              MountTargetId: 'MountTargetId',
              NetworkInterfaceId: 'NetworkInterfaceId',
            },
          },
          'igw-aws-us-east-1a': {
            response: <Partial<IInternetGatewayResponse>>{
              InternetGatewayId: 'InternetGatewayId',
            },
          },
          'nacl-aws-us-east-1a-private': {
            response: <Partial<INetworkAclResponse>>{
              associationId: 'AssociationId',
              defaultNetworkAclId: 'DefaultNetworkAclId',
              NetworkAclId: 'NetworkAclId',
            },
          },
          'nacl-aws-us-east-1a-public': {
            response: <Partial<INetworkAclResponse>>{
              associationId: 'AssociationId',
              defaultNetworkAclId: 'DefaultNetworkAclId',
              NetworkAclId: 'NetworkAclId',
            },
          },
          'rt-aws-us-east-1a-private': {
            response: <Partial<IRouteTableResponse>>{
              RouteTableId: 'RouteTableId',
              subnetAssociationId: 'SubnetAssociationId',
            },
          },
          'rt-aws-us-east-1a-public': {
            response: <Partial<IRouteTableResponse>>{
              RouteTableId: 'RouteTableId',
              subnetAssociationId: 'SubnetAssociationId',
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
          'subnet-aws-us-east-1a-private': {
            response: <Partial<ISubnetResponse>>{
              SubnetId: 'SubnetId',
            },
          },
          'subnet-aws-us-east-1a-public': {
            response: <Partial<ISubnetResponse>>{
              SubnetId: 'SubnetId',
            },
          },
          'vpc-aws-us-east-1a': {
            response: <Partial<IVpcResponse>>{
              VpcId: 'VpcId',
            },
          },
        },
        inputs: {
          'input.region.aws-us-east-1a.subnet.private.CidrBlock': '10.1.0.0/16',
          'input.region.aws-us-east-1a.subnet.public.CidrBlock': '10.0.0.0/16',
          'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
        },
      });
      await testModuleContainer.initialize(stateProvider);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should setup app', async () => {
      await expect(TestModule({ commit: true })).resolves.not.toThrow();
    });

    it('should add public and private subnet', async () => {
      const app = await TestModule({
        commit: false,
        includePrivateAndPublicSubnets: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "subnet=subnet-aws-us-east-1a-private",
             "value": "subnet-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "subnet=subnet-aws-us-east-1a-public",
             "value": "subnet-aws-us-east-1a-public",
           },
         ],
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "route-table=rt-aws-us-east-1a-private",
             "value": "rt-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "network-acl=nacl-aws-us-east-1a-private",
             "value": "nacl-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "route-table=rt-aws-us-east-1a-public",
             "value": "rt-aws-us-east-1a-public",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "network-acl=nacl-aws-us-east-1a-public",
             "value": "nacl-aws-us-east-1a-public",
           },
         ],
       ]
      `);
    });

    it('should connect public and private subnet', async () => {
      const app = await TestModule({
        commit: false,
        includePrivateAndPublicSubnets: true,
        includePublicConnectToPrivateSubnet: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "network-acl=nacl-aws-us-east-1a-private",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 1,
                 },
               ],
             },
           },
           {
             "action": "update",
             "field": "properties",
             "node": "network-acl=nacl-aws-us-east-1a-public",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 1,
                 },
               ],
             },
           },
         ],
       ]
      `);
    });

    it('should disable private subnet intra networking', async () => {
      const app = await TestModule({
        commit: false,
        includeDisablingOfPrivateSubnetIntraNetwork: true,
        includePrivateAndPublicSubnets: true,
        includePublicConnectToPrivateSubnet: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "network-acl=nacl-aws-us-east-1a-private",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 11,
                 },
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 11,
                 },
               ],
             },
           },
         ],
       ]
      `);
    });

    it('should mount filesystem in public and private subnet', async () => {
      const app = await TestModule({
        commit: false,
        includeDisablingOfPrivateSubnetIntraNetwork: true,
        includePrivateAndPublicSubnetMounts: true,
        includePrivateAndPublicSubnets: true,
        includePublicConnectToPrivateSubnet: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "efs-mount-target=efs-mount-aws-us-east-1a-public-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-public-shared-mounts",
           },
         ],
       ]
      `);
    });

    it('should unmount filesystem in public and private subnet', async () => {
      const app = await TestModule({
        commit: false,
        includeDisablingOfPrivateSubnetIntraNetwork: true,
        includePrivateAndPublicSubnets: true,
        includePublicConnectToPrivateSubnet: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "efs-mount-target=efs-mount-aws-us-east-1a-public-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-public-shared-mounts",
           },
         ],
       ]
      `);
    });

    it('should disconnect public and private subnet', async () => {
      const app = await TestModule({
        commit: false,
        includeDisablingOfPrivateSubnetIntraNetwork: true,
        includePrivateAndPublicSubnets: true,
        includePublicDisconnectToPrivateSubnet: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "network-acl=nacl-aws-us-east-1a-private",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
               ],
             },
           },
           {
             "action": "update",
             "field": "properties",
             "node": "network-acl=nacl-aws-us-east-1a-public",
             "value": {
               "key": "entries",
               "value": [],
             },
           },
         ],
       ]
      `);
    });

    it('should remove public and private subnet', async () => {
      const app = await TestModule({
        commit: false,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "route-table=rt-aws-us-east-1a-private",
             "value": "rt-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "network-acl=nacl-aws-us-east-1a-private",
             "value": "nacl-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "route-table=rt-aws-us-east-1a-public",
             "value": "rt-aws-us-east-1a-public",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "network-acl=nacl-aws-us-east-1a-public",
             "value": "nacl-aws-us-east-1a-public",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "subnet=subnet-aws-us-east-1a-private",
             "value": "subnet-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "node": "subnet=subnet-aws-us-east-1a-public",
             "value": "subnet-aws-us-east-1a-public",
           },
         ],
       ]
      `);
    });
  });
});
