import {
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { ISubnetResponse } from '../../subnet/subnet.interface';
import { Subnet } from '../../subnet/subnet.resource';
import { IVpcResponse } from '../../vpc/vpc.interface';
import { Vpc } from '../../vpc/vpc.resource';
import { INetworkAclProperties, INetworkAclResponse } from '../network-acl.interface';
import { NetworkAcl } from '../network-acl.resource';

export class AddNetworkAclAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddNetworkAclAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'network-acl';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.model as NetworkAcl;
    const properties = networkAcl.properties as unknown as INetworkAclProperties;
    properties.entries = JSON.parse(properties.entries as unknown as string);
    const response = networkAcl.response as unknown as INetworkAclResponse;

    const parents = networkAcl.getParents();
    const vpc = parents['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

    // Get default NACL.
    const defaultNACLOutput = await this.ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [subnetResponse.SubnetId] as string[],
          },
        ],
      }),
    );
    const association = defaultNACLOutput!.NetworkAcls![0].Associations!.find(
      (a) => a.SubnetId === subnetResponse.SubnetId,
    );

    // Create Network ACL.
    const naclOutput = await this.ec2Client.send(
      new CreateNetworkAclCommand({
        VpcId: vpcResponse.VpcId,
      }),
    );
    await Promise.all(
      properties.entries.map((p) => {
        return this.ec2Client.send(
          new CreateNetworkAclEntryCommand({
            CidrBlock: p.CidrBlock,
            Egress: p.Egress,
            NetworkAclId: naclOutput!.NetworkAcl!.NetworkAclId,
            PortRange: { From: p.PortRange.From, To: p.PortRange.To },
            Protocol: p.Protocol,
            RuleAction: p.RuleAction,
            RuleNumber: p.RuleNumber,
          }),
        );
      }),
    );

    // Associate Network ACL with given Subnet.
    await this.ec2Client.send(
      new ReplaceNetworkAclAssociationCommand({
        AssociationId: association!.NetworkAclAssociationId,
        NetworkAclId: naclOutput!.NetworkAcl!.NetworkAclId,
      }),
    );

    // Set response.
    response.NetworkAclId = naclOutput!.NetworkAcl!.NetworkAclId as string;
  }
}
