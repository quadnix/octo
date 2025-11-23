import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
} from '@aws-sdk/client-ec2';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  type DiffValueTypePropertyUpdate,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { SecurityGroupSchema } from '../index.schema.js';
import { SecurityGroup } from '../security-group.resource.js';

/**
 * @internal
 */
@Action(SecurityGroup)
export class UpdateSecurityGroupRulesResourceAction implements IResourceAction<SecurityGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, DiffValueTypePropertyUpdate>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof SecurityGroup &&
      hasNodeName(diff.node, 'security-group') &&
      diff.field === 'properties' &&
      diff.value.key === 'rules'
    );
  }

  async handle(diff: Diff<SecurityGroup>): Promise<SecurityGroupSchema['response']> {
    // Get properties.
    const securityGroup = diff.node;
    const properties = securityGroup.properties;
    const response = securityGroup.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Revoke existing rules from security group.
    await Promise.all([
      response.Rules!.egress!.length > 0
        ? ec2Client.send(
            new RevokeSecurityGroupEgressCommand({
              GroupId: response.GroupId,
              SecurityGroupRuleIds: response.Rules!.egress!.map((r) => r.SecurityGroupRuleId!),
            }),
          )
        : Promise.resolve(),
      response.Rules!.ingress!.length > 0
        ? ec2Client.send(
            new RevokeSecurityGroupIngressCommand({
              GroupId: response.GroupId,
              SecurityGroupRuleIds: response.Rules!.ingress!.map((r) => r.SecurityGroupRuleId!),
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

    return {
      ...response,
      Rules: {
        egress: egressOutput.SecurityGroupRules!.map((r: { SecurityGroupRuleId: string }) => ({
          SecurityGroupRuleId: r.SecurityGroupRuleId,
        })),
        ingress: ingressOutput.SecurityGroupRules!.map((r: { SecurityGroupRuleId: string }) => ({
          SecurityGroupRuleId: r.SecurityGroupRuleId,
        })),
      },
    };
  }

  async mock(
    diff: Diff<SecurityGroup>,
    capture: Partial<SecurityGroupSchema['response']>,
  ): Promise<SecurityGroupSchema['response']> {
    // Get properties.
    const securityGroup = diff.node;
    const response = securityGroup.response;

    return {
      ...response,
      Rules: {
        egress: capture.Rules!.egress,
        ingress: capture.Rules!.ingress,
      },
    };
  }
}

/**
 * @internal
 */
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
