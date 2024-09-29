import {
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { Subnet } from '../../subnet/index.js';
import type { Vpc } from '../../vpc/index.js';
import type { INetworkAclResponse } from '../network-acl.interface.js';
import { NetworkAcl } from '../network-acl.resource.js';

@Action(NetworkAcl)
export class AddNetworkAclResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof NetworkAcl &&
      (diff.node.constructor as typeof NetworkAcl).NODE_NAME === 'network-acl'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;
    const response = networkAcl.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    const parents = networkAcl.getParents();
    const vpc = parents['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    // Get default NACL.
    const defaultNACLOutput = await ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [subnetResponse.SubnetId],
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
    response.associationId = newAssociation.NewAssociationId!;
    response.defaultNetworkAclId = defaultNACLOutput!.NetworkAcls![0].NetworkAclId!;
    response.NetworkAclId = naclOutput!.NetworkAcl!.NetworkAclId!;
  }

  async mock(capture: Partial<INetworkAclResponse>, diff: Diff): Promise<void> {
    const networkAcl = diff.node as NetworkAcl;
    const parents = networkAcl.getParents();
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof DescribeNetworkAclsCommand) {
        return {
          NetworkAcls: [
            {
              Associations: [{ SubnetId: subnetResponse.SubnetId }],
              NetworkAclId: capture.defaultNetworkAclId,
            },
          ],
        };
      } else if (instance instanceof CreateNetworkAclCommand) {
        return { NetworkAcl: { NetworkAclId: capture.NetworkAclId } };
      } else if (instance instanceof CreateNetworkAclEntryCommand) {
        return;
      } else if (instance instanceof ReplaceNetworkAclAssociationCommand) {
        return { NewAssociationId: capture.associationId };
      }
    };
  }
}

@Factory<AddNetworkAclResourceAction>(AddNetworkAclResourceAction)
export class AddNetworkAclResourceActionFactory {
  static async create(): Promise<AddNetworkAclResourceAction> {
    return new AddNetworkAclResourceAction();
  }
}
