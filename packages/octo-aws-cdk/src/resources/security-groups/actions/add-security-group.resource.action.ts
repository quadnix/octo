import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IVpcResponse } from '../../vpc/vpc.interface.js';
import { Vpc } from '../../vpc/vpc.resource.js';
import { ISecurityGroupProperties, ISecurityGroupResponse } from '../security-group.interface.js';
import { SecurityGroup } from '../security-group.resource.js';

@Action(ModelType.RESOURCE)
export class AddSecurityGroupResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupResourceAction';

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
    if (egressPermissions.length > 0) {
      await ec2Client.send(
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
      await ec2Client.send(
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

@Factory<AddSecurityGroupResourceAction>(AddSecurityGroupResourceAction)
export class AddSecurityGroupResourceActionFactory {
  static async create(): Promise<AddSecurityGroupResourceAction> {
    return new AddSecurityGroupResourceAction();
  }
}
