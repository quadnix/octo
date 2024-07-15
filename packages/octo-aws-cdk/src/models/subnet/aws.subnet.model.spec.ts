import { App, SubnetType, TestContainer, TestModuleContainer } from '@quadnix/octo';
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
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should create new subnet and delete it', async () => {
      // Add region.
      const app = new App('test');
      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);
      // Add shared-mounts filesystem.
      await region.addFilesystem('shared-mounts');
      await testModuleContainer.commit(app);

      // Add private subnet.
      const privateSubnet = new AwsSubnet(region, 'private');
      region.addSubnet(privateSubnet);
      // Add public subnet.
      const publicSubnet = new AwsSubnet(region, 'public');
      publicSubnet.subnetType = SubnetType.PUBLIC;
      region.addSubnet(publicSubnet);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "subnet=subnet-aws-us-east-1a-private",
             "value": "subnet-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "subnet=subnet-aws-us-east-1a-public",
             "value": "subnet-aws-us-east-1a-public",
           },
         ],
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "route-table=rt-aws-us-east-1a-private",
             "value": "rt-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "network-acl=nacl-aws-us-east-1a-private",
             "value": "nacl-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "route-table=rt-aws-us-east-1a-public",
             "value": "rt-aws-us-east-1a-public",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "network-acl=nacl-aws-us-east-1a-public",
             "value": "nacl-aws-us-east-1a-public",
           },
         ],
       ]
      `);

      // Allow public subnet to connect to private subnet.
      publicSubnet.updateNetworkingRules(privateSubnet, true);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "model": "network-acl=nacl-aws-us-east-1a-private",
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
                   "RuleNumber": 10,
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
                   "RuleNumber": 10,
                 },
               ],
             },
           },
           {
             "action": "update",
             "field": "properties",
             "model": "network-acl=nacl-aws-us-east-1a-public",
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
                   "RuleNumber": 10,
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
                   "RuleNumber": 10,
                 },
               ],
             },
           },
         ],
       ]
      `);

      // Disable private subnet intra networking.
      privateSubnet.disableSubnetIntraNetwork = true;
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "model": "network-acl=nacl-aws-us-east-1a-private",
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
                   "RuleNumber": 10,
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
                   "RuleNumber": 10,
                 },
               ],
             },
           },
         ],
       ]
      `);

      // Mount "shared-mounts" in private and public subnet.
      await privateSubnet.addFilesystemMount('shared-mounts');
      await publicSubnet.addFilesystemMount('shared-mounts');
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "efs-mount-target=efs-mount-aws-us-east-1a-public-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-public-shared-mounts",
           },
         ],
       ]
      `);

      // Unmount "shared-mounts" in private and public subnet.
      await privateSubnet.removeFilesystemMount('shared-mounts');
      await publicSubnet.removeFilesystemMount('shared-mounts');
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "efs-mount-target=efs-mount-aws-us-east-1a-public-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-public-shared-mounts",
           },
         ],
       ]
      `);

      // Disconnect public and private subnet connection..
      publicSubnet.updateNetworkingRules(privateSubnet, false);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "model": "network-acl=nacl-aws-us-east-1a-private",
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
             "model": "network-acl=nacl-aws-us-east-1a-public",
             "value": {
               "key": "entries",
               "value": [],
             },
           },
         ],
       ]
      `);

      // Remove private and public subnet.
      await privateSubnet.remove();
      await publicSubnet.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "route-table=rt-aws-us-east-1a-private",
             "value": "rt-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "network-acl=nacl-aws-us-east-1a-private",
             "value": "nacl-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "route-table=rt-aws-us-east-1a-public",
             "value": "rt-aws-us-east-1a-public",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "network-acl=nacl-aws-us-east-1a-public",
             "value": "nacl-aws-us-east-1a-public",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "subnet=subnet-aws-us-east-1a-private",
             "value": "subnet-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "subnet=subnet-aws-us-east-1a-public",
             "value": "subnet-aws-us-east-1a-public",
           },
         ],
       ]
      `);
    });
  });
});
