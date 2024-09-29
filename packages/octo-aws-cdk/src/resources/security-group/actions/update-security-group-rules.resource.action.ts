import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { ISecurityGroupResponse } from '../security-group.interface.js';
import { SecurityGroup } from '../security-group.resource.js';

@Action(SecurityGroup)
export class UpdateSecurityGroupRulesResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof SecurityGroup &&
      (diff.node.constructor as typeof SecurityGroup).NODE_NAME === 'security-group' &&
      diff.field === 'rules'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.node as SecurityGroup;
    const properties = securityGroup.properties;
    const response = securityGroup.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Revoke existing rules from security group.
    await Promise.all([
      response.Rules.egress!.length > 0
        ? ec2Client.send(
            new RevokeSecurityGroupEgressCommand({
              GroupId: response.GroupId,
              SecurityGroupRuleIds: response.Rules.egress!.map((r) => r.SecurityGroupRuleId!),
            }),
          )
        : Promise.resolve(),
      response.Rules.ingress!.length > 0
        ? ec2Client.send(
            new RevokeSecurityGroupIngressCommand({
              GroupId: response.GroupId,
              SecurityGroupRuleIds: response.Rules.ingress!.map((r) => r.SecurityGroupRuleId!),
            }),
          )
        : Promise.resolve(),
    ]);

    // Create new security group rules.
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

    // Apply new security group rules.
    const [egressOutput, ingressOutput] = await Promise.all([
      egressPermissions.length > 0
        ? ec2Client.send(
            new AuthorizeSecurityGroupEgressCommand({
              GroupId: response.GroupId,
              IpPermissions: egressPermissions,
            }),
          )
        : Promise.resolve({ SecurityGroupRules: [] }),
      ingressPermissions.length > 0
        ? ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
              GroupId: response.GroupId,
              IpPermissions: ingressPermissions,
            }),
          )
        : Promise.resolve({ SecurityGroupRules: [] }),
    ]);

    // Set response.
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
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof RevokeSecurityGroupEgressCommand) {
        return;
      } else if (instance instanceof RevokeSecurityGroupIngressCommand) {
        return;
      } else if (instance instanceof AuthorizeSecurityGroupEgressCommand) {
        return { SecurityGroupRules: capture.Rules!.egress };
      } else if (instance instanceof AuthorizeSecurityGroupIngressCommand) {
        return { SecurityGroupRules: capture.Rules!.ingress };
      }
    };
  }
}

@Factory<UpdateSecurityGroupRulesResourceAction>(UpdateSecurityGroupRulesResourceAction)
export class UpdateSecurityGroupRulesResourceActionFactory {
  static async create(): Promise<UpdateSecurityGroupRulesResourceAction> {
    return new UpdateSecurityGroupRulesResourceAction();
  }
}
