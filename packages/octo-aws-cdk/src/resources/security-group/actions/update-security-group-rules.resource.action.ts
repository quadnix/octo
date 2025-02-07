import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { SecurityGroup } from '../security-group.resource.js';
import type { SecurityGroupSchema } from '../security-group.schema.js';

@Action(SecurityGroup)
export class UpdateSecurityGroupRulesResourceAction implements IResourceAction<SecurityGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof SecurityGroup &&
      (diff.node.constructor as typeof SecurityGroup).NODE_NAME === 'security-group' &&
      diff.field === 'properties' &&
      (diff.value as { key: string }).key === 'rules'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.node as SecurityGroup;
    const properties = securityGroup.properties;
    const response = securityGroup.response;

    // Get instances.
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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
      egress: egressOutput.SecurityGroupRules!.map((r: { SecurityGroupRuleId: string }) => ({
        SecurityGroupRuleId: r.SecurityGroupRuleId,
      })),
      ingress: ingressOutput.SecurityGroupRules!.map((r: { SecurityGroupRuleId: string }) => ({
        SecurityGroupRuleId: r.SecurityGroupRuleId,
      })),
    };
  }

  async mock(diff: Diff, capture: Partial<SecurityGroupSchema['response']>): Promise<void> {
    // Get properties.
    const securityGroup = diff.node as SecurityGroup;
    const properties = securityGroup.properties;

    // Get instances.
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
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
  private static instance: UpdateSecurityGroupRulesResourceAction;

  static async create(): Promise<UpdateSecurityGroupRulesResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateSecurityGroupRulesResourceAction(container);
    }
    return this.instance;
  }
}
