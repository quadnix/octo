import {
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { NetworkAcl } from '../network-acl.resource.js';
import type { NetworkAclSchema } from '../network-acl.schema.js';

@Action(NetworkAcl)
export class AddNetworkAclResourceAction implements IResourceAction<NetworkAcl> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof NetworkAcl &&
      (diff.node.constructor as typeof NetworkAcl).NODE_NAME === 'network-acl' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;
    const response = networkAcl.response;
    const networkAclVpc = networkAcl.parents[0];
    const networkAclSubnet = networkAcl.parents[1];

    // Get instances.
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Get default NACL.
    const defaultNACLOutput = await ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [networkAclSubnet.getSchemaInstance().response.SubnetId],
          },
        ],
      }),
    );
    const association = defaultNACLOutput!.NetworkAcls![0].Associations!.find(
      (a) => a.SubnetId === networkAclSubnet.getSchemaInstance().response.SubnetId,
    );

    // Create Network ACL.
    const naclOutput = await ec2Client.send(
      new CreateNetworkAclCommand({
        VpcId: networkAclVpc.getSchemaInstance().response.VpcId,
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

  async mock(diff: Diff, capture: Partial<NetworkAclSchema['response']>): Promise<void> {
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;
    const networkAclSubnet = networkAcl.parents[1];

    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DescribeNetworkAclsCommand) {
        return {
          NetworkAcls: [
            {
              Associations: [{ SubnetId: networkAclSubnet.getSchemaInstance().response.SubnetId }],
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
  private static instance: AddNetworkAclResourceAction;

  static async create(): Promise<AddNetworkAclResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddNetworkAclResourceAction(container);
    }
    return this.instance;
  }
}
