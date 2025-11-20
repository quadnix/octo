import {
  CreateNetworkAclEntryCommand,
  DeleteNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  type NetworkAclEntry,
  ReplaceNetworkAclEntryCommand,
} from '@aws-sdk/client-ec2';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  type DiffValueTypePropertyUpdate,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import pLimit from 'p-limit';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { NetworkAclUtility } from '../../../utilities/network-acl/network-acl.utility.js';
import type { NetworkAclSchema } from '../index.schema.js';
import { NetworkAcl } from '../network-acl.resource.js';

/**
 * @internal
 */
@Action(NetworkAcl)
export class UpdateNetworkAclEntriesResourceAction implements IResourceAction<NetworkAcl> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, DiffValueTypePropertyUpdate>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof NetworkAcl &&
      hasNodeName(diff.node, 'network-acl') &&
      diff.field === 'properties' &&
      diff.value.key === 'entries'
    );
  }

  async handle(diff: Diff<NetworkAcl>): Promise<NetworkAclSchema['response']> {
    // Get properties.
    const networkAcl = diff.node;
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
            Values: [networkAclSubnet.getSchemaInstanceInResourceAction().response.SubnetId],
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

    return response;
  }

  async mock(diff: Diff<NetworkAcl>): Promise<NetworkAclSchema['response']> {
    const networkAcl = diff.node;
    return networkAcl.response;
  }
}

/**
 * @internal
 */
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
