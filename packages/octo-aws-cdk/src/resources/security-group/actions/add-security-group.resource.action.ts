import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { SecurityGroupSchema } from '../index.schema.js';
import { SecurityGroup } from '../security-group.resource.js';

/**
 * @internal
 */
@Action(SecurityGroup)
export class AddSecurityGroupResourceAction implements IResourceAction<SecurityGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof SecurityGroup &&
      hasNodeName(diff.node, 'security-group') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<SecurityGroup>): Promise<SecurityGroupSchema['response']> {
    // Get properties.
    const securityGroup = diff.node;
    const properties = securityGroup.properties;
    const tags = securityGroup.tags;
    const securityGroupVpc = securityGroup.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create Security Group.
    const securityGroupOutput = await ec2Client.send(
      new CreateSecurityGroupCommand({
        Description: securityGroup.resourceId,
        GroupName: securityGroup.resourceId,
        TagSpecifications: [
          {
            ResourceType: 'security-group',
            Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
          },
        ],
        VpcId: securityGroupVpc.getSchemaInstanceInResourceAction().response.VpcId,
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

    const groupId = securityGroupOutput.GroupId!;
    return {
      Arn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:security-group/${groupId}`,
      GroupId: groupId,
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
    const properties = securityGroup.properties;

    return {
      Arn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:security-group/${capture.GroupId}`,
      GroupId: capture.GroupId!,
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
@Factory<AddSecurityGroupResourceAction>(AddSecurityGroupResourceAction)
export class AddSecurityGroupResourceActionFactory {
  private static instance: AddSecurityGroupResourceAction;

  static async create(): Promise<AddSecurityGroupResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddSecurityGroupResourceAction(container);
    }
    return this.instance;
  }
}
