import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IVpcResponse } from '../../vpc/vpc.interface.js';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { ISecurityGroupProperties, ISecurityGroupResponse } from '../security-group.interface.js';
import { SecurityGroup } from '../security-group.resource.js';

@Action(ModelType.RESOURCE)
export class AddSecurityGroupResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof SecurityGroup &&
      diff.model.MODEL_NAME === 'security-group'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.model as SecurityGroup;
    const properties = securityGroup.properties as unknown as ISecurityGroupProperties;
    const response = securityGroup.response as unknown as ISecurityGroupResponse;
    const vpc = securityGroup.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;

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
    response.GroupId = securityGroupOutput.GroupId as string;
    response.Rules = {
      egress: egressOutput.SecurityGroupRules!.map((r) => ({
        SecurityGroupRuleId: r.SecurityGroupRuleId,
      })),
      ingress: ingressOutput.SecurityGroupRules!.map((r) => ({
        SecurityGroupRuleId: r.SecurityGroupRuleId,
      })),
    };
  }
}

@Factory<AddSecurityGroupResourceAction>(AddSecurityGroupResourceAction)
export class AddSecurityGroupResourceActionFactory {
  static async create(): Promise<AddSecurityGroupResourceAction> {
    return new AddSecurityGroupResourceAction();
  }
}
