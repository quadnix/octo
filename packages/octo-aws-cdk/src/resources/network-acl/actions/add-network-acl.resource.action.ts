import {
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { ISubnetResponse } from '../../subnet/subnet.interface.js';
import type { Subnet } from '../../subnet/subnet.resource.js';
import type { IVpcResponse } from '../../vpc/vpc.interface.js';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { INetworkAclProperties, INetworkAclResponse } from '../network-acl.interface.js';
import type { NetworkAcl } from '../network-acl.resource.js';

@Action(ModelType.RESOURCE)
export class AddNetworkAclResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddNetworkAclResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'network-acl';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.model as NetworkAcl;
    const properties = networkAcl.properties as unknown as INetworkAclProperties;
    const response = networkAcl.response as unknown as INetworkAclResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    const parents = networkAcl.getParents();
    const vpc = parents['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

    // Get default NACL.
    const defaultNACLOutput = await ec2Client.send(
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
    const naclOutput = await ec2Client.send(
      new CreateNetworkAclCommand({
        VpcId: vpcResponse.VpcId,
      }),
    );
    await Promise.all(
      properties.entries.map((p) => {
        return ec2Client.send(
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

    // Associate Subnet with the new Network ACL.
    const newAssociation = await ec2Client.send(
      new ReplaceNetworkAclAssociationCommand({
        AssociationId: association!.NetworkAclAssociationId,
        NetworkAclId: naclOutput!.NetworkAcl!.NetworkAclId,
      }),
    );

    // Set response.
    response.associationId = newAssociation.NewAssociationId as string;
    response.defaultNetworkAclId = defaultNACLOutput!.NetworkAcls![0].NetworkAclId as string;
    response.NetworkAclId = naclOutput!.NetworkAcl!.NetworkAclId as string;
  }
}

@Factory<AddNetworkAclResourceAction>(AddNetworkAclResourceAction)
export class AddNetworkAclResourceActionFactory {
  static async create(): Promise<AddNetworkAclResourceAction> {
    return new AddNetworkAclResourceAction();
  }
}
