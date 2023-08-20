import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IVpcResponse } from '../../vpc/vpc.interface';
import { Vpc } from '../../vpc/vpc.resource';
import { ISecurityGroupProperties, ISecurityGroupResponse } from '../security-group.interface';
import { SecurityGroup } from '../security-group.resource';

export class AddSecurityGroupAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'security-group';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.model as SecurityGroup;
    const properties = securityGroup.properties as unknown as ISecurityGroupProperties;
    properties.rules = JSON.parse(properties.rules as unknown as string);
    const response = securityGroup.response as unknown as ISecurityGroupResponse;
    const vpc = securityGroup.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;

    // Create Security Group.
    const securityGroupOutput = await this.ec2Client.send(
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
    if (egressPermissions.length > 0) {
      await this.ec2Client.send(
        new AuthorizeSecurityGroupEgressCommand({
          GroupId: securityGroupOutput.GroupId,
          IpPermissions: egressPermissions,
        }),
      );
    }
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
    if (ingressPermissions.length > 0) {
      await this.ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupOutput.GroupId,
          IpPermissions: ingressPermissions,
        }),
      );
    }

    // Set response.
    response.GroupId = securityGroupOutput.GroupId as string;
  }
}
