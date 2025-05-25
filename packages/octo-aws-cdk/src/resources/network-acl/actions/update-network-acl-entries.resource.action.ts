import {
  CreateNetworkAclEntryCommand,
  DeleteNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  type NetworkAclEntry,
  ReplaceNetworkAclEntryCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import pLimit from 'p-limit';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { NetworkAclUtility } from '../../../utilities/network-acl/network-acl.utility.js';
import { NetworkAcl } from '../network-acl.resource.js';
import type { NetworkAclSchema } from '../network-acl.schema.js';

@Action(NetworkAcl)
export class UpdateNetworkAclEntriesResourceAction implements IResourceAction<NetworkAcl> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof NetworkAcl &&
      (diff.node.constructor as typeof NetworkAcl).NODE_NAME === 'network-acl' &&
      diff.field === 'properties' &&
      (diff.value as { key: string; value: unknown }).key === 'entries'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;
    const response = networkAcl.response;
    const networkAclSubnet = networkAcl.parents[1];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    const limit = pLimit(100);

    // Get NACL entries.
    const nAclOutput = await ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [networkAclSubnet.getSchemaInstance().response.SubnetId],
          },
        ],
      }),
    );
    const nAclEntries = nAclOutput!.NetworkAcls![0].Entries!;

    const nAclEgressEntries = nAclEntries.filter((e) => e.Egress && e.RuleNumber! <= 32766);
    const nAclIngressEntries = nAclEntries.filter((e) => !e.Egress && e.RuleNumber! <= 32766);
    const propertiesEgressEntries = properties.entries.filter((e) => e.Egress);
    const propertiesIngressEntries = properties.entries.filter((e) => !e.Egress);

    // Collect entries to add, delete, and replace.
    const entriesToAdd: NetworkAclSchema['properties']['entries'] = [];
    const entriesToDelete: NetworkAclEntry[] = [];
    const entriesToReplace: NetworkAclSchema['properties']['entries'] = [];
    nAclEgressEntries.forEach((e) => {
      const index = propertiesEgressEntries.findIndex((pe) => pe.RuleNumber === e.RuleNumber);

      if (index === -1) {
        entriesToDelete.push(e);
      } else if (index >= 0 && !NetworkAclUtility.isNAclEntryEqual(e, propertiesEgressEntries[index])) {
        entriesToReplace.push(propertiesEgressEntries[index]);
      }
    });
    nAclIngressEntries.forEach((e) => {
      const index = propertiesIngressEntries.findIndex((pe) => pe.RuleNumber === e.RuleNumber);

      if (index === -1) {
        entriesToDelete.push(e);
      } else if (index >= 0 && !NetworkAclUtility.isNAclEntryEqual(e, propertiesIngressEntries[index])) {
        entriesToReplace.push(propertiesIngressEntries[index]);
      }
    });
    propertiesEgressEntries.forEach((pe) => {
      if (!nAclEgressEntries.some((e) => e.RuleNumber === pe.RuleNumber)) {
        entriesToAdd.push(pe);
      }
    });
    propertiesIngressEntries.forEach((pe) => {
      if (!nAclIngressEntries.some((e) => e.RuleNumber === pe.RuleNumber)) {
        entriesToAdd.push(pe);
      }
    });

    // Update NACL entries.
    await Promise.all([
      ...entriesToAdd.map((pe) => {
        return limit(() =>
          ec2Client.send(
            new CreateNetworkAclEntryCommand({
              CidrBlock: pe.CidrBlock,
              Egress: pe.Egress,
              NetworkAclId: response.NetworkAclId,
              PortRange: { From: pe.PortRange.From, To: pe.PortRange.To },
              Protocol: pe.Protocol,
              RuleAction: pe.RuleAction,
              RuleNumber: pe.RuleNumber,
            }),
          ),
        );
      }),
      ...entriesToDelete.map((e) => {
        return limit(() =>
          ec2Client.send(
            new DeleteNetworkAclEntryCommand({
              Egress: e.Egress,
              NetworkAclId: response.NetworkAclId,
              RuleNumber: e.RuleNumber,
            }),
          ),
        );
      }),
      ...entriesToReplace.map((pe) => {
        return limit(() =>
          ec2Client.send(
            new ReplaceNetworkAclEntryCommand({
              CidrBlock: pe.CidrBlock,
              Egress: pe.Egress,
              NetworkAclId: response.NetworkAclId,
              PortRange: { From: pe.PortRange.From, To: pe.PortRange.To },
              Protocol: pe.Protocol,
              RuleAction: pe.RuleAction,
              RuleNumber: pe.RuleNumber,
            }),
          ),
        );
      }),
    ]);
  }

  async mock(diff: Diff): Promise<void> {
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DescribeNetworkAclsCommand) {
        return {
          NetworkAcls: [{ Entries: [] }],
        };
      } else if (instance instanceof CreateNetworkAclEntryCommand) {
        return;
      } else if (instance instanceof DeleteNetworkAclEntryCommand) {
        return;
      } else if (instance instanceof ReplaceNetworkAclEntryCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateNetworkAclEntriesResourceAction>(UpdateNetworkAclEntriesResourceAction)
export class UpdateNetworkAclEntriesResourceActionFactory {
  private static instance: UpdateNetworkAclEntriesResourceAction;

  static async create(): Promise<UpdateNetworkAclEntriesResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateNetworkAclEntriesResourceAction(container);
    }
    return this.instance;
  }
}
