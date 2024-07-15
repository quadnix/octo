import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import {
  AwsDeployment,
  AwsEnvironment,
  AwsExecution,
  AwsRegion,
  AwsServer,
  AwsSubnet,
  OctoAwsCdkPackageMock,
  RegionId,
} from '../../index.js';
import type { IEcsClusterResponse } from '../../resources/ecs/ecs-cluster.interface.js';
import type { IEcsServiceResponse } from '../../resources/ecs/ecs-service.interface.js';
import type { IEcsTaskDefinitionResponse } from '../../resources/ecs/ecs-task-definition.interface.js';
import type { IEfsMountTargetResponse } from '../../resources/efs/efs-mount-target.interface.js';
import type { IEfsResponse } from '../../resources/efs/efs.interface.js';
import type { IIamRoleResponse } from '../../resources/iam/iam-role.interface.js';
import type { IInternetGatewayResponse } from '../../resources/internet-gateway/internet-gateway.interface.js';
import type { INetworkAclResponse } from '../../resources/network-acl/network-acl.interface.js';
import type { IRouteTableResponse } from '../../resources/route-table/route-table.interface.js';
import type { ISecurityGroupResponse } from '../../resources/security-group/security-group.interface.js';
import type { ISubnetResponse } from '../../resources/subnet/subnet.interface.js';
import type { IVpcResponse } from '../../resources/vpc/vpc.interface.js';

describe('Execution UT', () => {
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
          'ecs-service-aws-us-east-1a-backend': {
            response: <Partial<IEcsServiceResponse>>{
              serviceArn: 'ServiceArn',
            },
          },
          'ecs-task-definition-aws-us-east-1a-backend-0.0.1': {
            response: <Partial<IEcsTaskDefinitionResponse>>{
              revision: 1,
              taskDefinitionArn: 'TaskDefinitionArn',
            },
          },
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
          'iam-role-backend-ServerRole': {
            response: <Partial<IIamRoleResponse>>{
              Arn: 'Arn',
              RoleId: 'RoleId',
              RoleName: 'RoleName',
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
          'sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup': {
            response: <Partial<ISecurityGroupResponse>>{
              GroupId: 'GroupId',
              Rules: {
                egress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
                ingress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
              },
            },
          },
          'sec-grp-backend-SecurityGroup': {
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
          'input.region.aws-us-east-1a.subnet.private.CidrBlock': '10.0.0.0/16',
          'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
        },
      });
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should test e2e', async () => {
      // Create execution pre-requisites.
      const app = new App('test');
      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);
      const subnet = new AwsSubnet(region, 'private');
      region.addSubnet(subnet);
      const environment = new AwsEnvironment('qa');
      region.addEnvironment(environment);
      const server = new AwsServer('backend');
      app.addServer(server);
      const deployment = new AwsDeployment('0.0.1');
      server.addDeployment(deployment);
      await testModuleContainer.commit(app);

      // Create a new execution.
      const execution = new AwsExecution(deployment, environment, subnet);
      await execution.init();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
             "value": "ecs-task-definition-aws-us-east-1a-backend-0.0.1",
           },
         ],
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "ecs-service-aws-us-east-1a-backend",
           },
         ],
       ]
      `);

      // Add security group rules for the server.
      server.addSecurityGroupRule({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 8080,
        IpProtocol: 'tcp',
        ToPort: 8080,
      });
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "security-group=sec-grp-backend-SecurityGroup",
             "value": "sec-grp-backend-SecurityGroup",
           },
         ],
         [
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "",
           },
         ],
       ]
      `);

      // Add security group rules for the execution.
      execution.addSecurityGroupRule({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 8081,
        IpProtocol: 'tcp',
        ToPort: 8081,
      });
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "security-group=sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
             "value": "sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
           },
         ],
         [
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "",
           },
         ],
       ]
      `);

      // Mount filesystem.
      await region.addFilesystem('shared-mounts');
      await subnet.addFilesystemMount('shared-mounts');
      await execution.mountFilesystem('shared-mounts');
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
         [
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
             "value": "",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
           },
         ],
         [
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "",
           },
         ],
       ]
      `);

      // Update desired count, and remove a security group.
      execution.updateDesiredCount(2);
      execution.removeSecurityGroupRule({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 8081,
        IpProtocol: 'tcp',
        ToPort: 8081,
      });
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "security-group=sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
             "value": "sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
           },
         ],
       ]
      `);

      // Remove security group.
      server.removeSecurityGroupRule({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 8080,
        IpProtocol: 'tcp',
        ToPort: 8080,
      });
      await execution.unmountFilesystem('shared-mounts');
      await subnet.removeFilesystemMount('shared-mounts');
      await region.removeFilesystem('shared-mounts');
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
             "value": "",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "efs=efs-aws-us-east-1a-shared-mounts",
             "value": "efs-aws-us-east-1a-shared-mounts",
           },
           {
             "action": "update",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "security-group=sec-grp-backend-SecurityGroup",
             "value": "sec-grp-backend-SecurityGroup",
           },
         ],
       ]
      `);

      // Remove execution.
      await execution.destroy();
      execution.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
             "value": "ecs-service-aws-us-east-1a-backend",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
             "value": "ecs-task-definition-aws-us-east-1a-backend-0.0.1",
           },
         ],
       ]
      `);
    });
  });
});
