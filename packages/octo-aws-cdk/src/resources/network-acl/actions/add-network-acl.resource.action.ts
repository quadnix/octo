import {
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { NetworkAclSchema } from '../index.schema.js';
import { NetworkAcl } from '../network-acl.resource.js';

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
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Get default NACL.
    const defaultNACLOutput = await ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [networkAclSubnet.getSchemaInstanceInResourceAction().response.SubnetId],
          },
        ],
      }),
    );
    const association = defaultNACLOutput!.NetworkAcls![0].Associations!.find(
      (a) => a.SubnetId === networkAclSubnet.getSchemaInstanceInResourceAction().response.SubnetId,
    );

    // Create Network ACL.
    const naclOutput = await ec2Client.send(
      new CreateNetworkAclCommand({
        VpcId: networkAclVpc.getSchemaInstanceInResourceAction().response.VpcId,
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
    const { awsAccountId, awsRegionId } = properties;
    const networkAclId = naclOutput!.NetworkAcl!.NetworkAclId!;
    response.associationId = newAssociation.NewAssociationId!;
    response.defaultNetworkAclId = defaultNACLOutput!.NetworkAcls![0].NetworkAclId!;
    response.NetworkAclArn = `arn:aws:ec2:${awsRegionId}:${awsAccountId}:network-acl/${networkAclId}`;
    response.NetworkAclId = networkAclId;
  }

  async mock(diff: Diff, capture: Partial<NetworkAclSchema['response']>): Promise<void> {
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;
    const networkAclSubnet = networkAcl.parents[1];

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DescribeNetworkAclsCommand) {
        return {
          NetworkAcls: [
            {
              Associations: [{ SubnetId: networkAclSubnet.getSchemaInstanceInResourceAction().response.SubnetId }],
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
