import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { ISecurityGroupResponse } from '../security-group.interface.js';
import { SecurityGroup } from '../security-group.resource.js';

@Action(NodeType.RESOURCE)
export class AddSecurityGroupResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD && diff.node instanceof SecurityGroup && diff.node.NODE_NAME === 'security-group'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.node as SecurityGroup;
    const properties = securityGroup.properties;
    const response = securityGroup.response;
    const vpc = securityGroup.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Create Security Group.
    const securityGroupOutput = await ec2Client.send(
      new CreateSecurityGroupCommand({
        Description: securityGroup.resourceId,
        GroupName: securityGroup.resourceId,
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Create Security Group rules.
    const egressPermissions = properties.rules
      .filter((rule) => rule.Egress)
      .map((rule) => ({
        FromPort: rule.FromPort,
        IpProtocol: rule.IpProtocol,
        IpRanges: [
          {
            CidrIp: rule.CidrBlock,
          },
        ],
        ToPort: rule.ToPort,
      }));
    const ingressPermissions = properties.rules
      .filter((rule) => !rule.Egress)
      .map((rule) => ({
        FromPort: rule.FromPort,
        IpProtocol: rule.IpProtocol,
        IpRanges: [
          {
            CidrIp: rule.CidrBlock,
          },
        ],
        ToPort: rule.ToPort,
      }));

    // Apply security group rules.
    const [egressOutput, ingressOutput] = await Promise.all([
      egressPermissions.length > 0
        ? ec2Client.send(
            new AuthorizeSecurityGroupEgressCommand({
              GroupId: securityGroupOutput.GroupId,
              IpPermissions: egressPermissions,
            }),
          )
        : Promise.resolve({ SecurityGroupRules: [] }),
      ingressPermissions.length > 0
        ? ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
              GroupId: securityGroupOutput.GroupId,
              IpPermissions: ingressPermissions,
            }),
          )
        : Promise.resolve({ SecurityGroupRules: [] }),
    ]);

    // Set response.
    response.GroupId = securityGroupOutput.GroupId!;
    response.Rules = {
      egress: egressOutput.SecurityGroupRules!.map((r) => ({
        SecurityGroupRuleId: r.SecurityGroupRuleId,
      })),
      ingress: ingressOutput.SecurityGroupRules!.map((r) => ({
        SecurityGroupRuleId: r.SecurityGroupRuleId,
      })),
    };
  }

  async mock(capture: Partial<ISecurityGroupResponse>): Promise<void> {
    const ec2Client = await Container.get(EC2Client);
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateSecurityGroupCommand) {
        return { GroupId: capture.GroupId };
      } else if (instance instanceof AuthorizeSecurityGroupEgressCommand) {
        return { SecurityGroupRules: capture.Rules!.egress };
      } else if (instance instanceof AuthorizeSecurityGroupIngressCommand) {
        return { SecurityGroupRules: capture.Rules!.ingress };
      }
    };
  }
}

@Factory<AddSecurityGroupResourceAction>(AddSecurityGroupResourceAction)
export class AddSecurityGroupResourceActionFactory {
  static async create(): Promise<AddSecurityGroupResourceAction> {
    return new AddSecurityGroupResourceAction();
  }
}
