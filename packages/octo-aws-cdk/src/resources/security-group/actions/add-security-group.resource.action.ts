import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { Vpc } from '../../vpc/index.js';
import { SecurityGroup } from '../security-group.resource.js';
import type { SecurityGroupSchema } from '../security-group.schema.js';

@Action(SecurityGroup)
export class AddSecurityGroupResourceAction implements IResourceAction<SecurityGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof SecurityGroup &&
      (diff.node.constructor as typeof SecurityGroup).NODE_NAME === 'security-group'
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
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
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
  private static instance: AddSecurityGroupResourceAction;

  static async create(): Promise<AddSecurityGroupResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddSecurityGroupResourceAction(container);
    }
    return this.instance;
  }
}
