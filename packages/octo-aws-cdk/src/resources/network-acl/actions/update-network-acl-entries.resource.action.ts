import {
  CreateNetworkAclEntryCommand,
  DeleteNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  NetworkAclEntry,
  ReplaceNetworkAclEntryCommand,
} from '@aws-sdk/client-ec2';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { ISubnetResponse } from '../../subnet/subnet.interface.js';
import type { Subnet } from '../../subnet/subnet.resource.js';
import type { INetworkAclProperties, INetworkAclResponse } from '../network-acl.interface.js';
import type { NetworkAcl } from '../network-acl.resource.js';
import pLimit from 'p-limit';

@Action(ModelType.RESOURCE)
export class UpdateNetworkAclEntriesResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateNetworkAclEntriesResourceAction';

  filter(diff: Diff): boolean {
    const updatedKeys = Object.keys(diff.value as { key: string; value: unknown });
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'network-acl' &&
      diff.field === 'properties' &&
      updatedKeys.includes('entries')
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.model as NetworkAcl;
    const properties = networkAcl.properties as unknown as INetworkAclProperties;
    const response = networkAcl.response as unknown as INetworkAclResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });
    const limit = pLimit(100);

    const parents = networkAcl.getParents();
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

    // Get NACL entries.
    const nAclOutput = await ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [subnetResponse.SubnetId] as string[],
          },
        ],
      }),
    );
    const nAclEntries = nAclOutput!.NetworkAcls![0].Entries!;

    const nAclEgressEntries = nAclEntries.filter((e) => e.Egress);
    const nAclIngressEntries = nAclEntries.filter((e) => !e.Egress);
    const propertiesEgressEntries = properties.entries.filter((e) => e.Egress);
    const propertiesIngressEntries = properties.entries.filter((e) => !e.Egress);

    // Collect entries to add, delete, and replace.
    const entriesToAdd: INetworkAclProperties['entries'] = [];
    const entriesToDelete: NetworkAclEntry[] = [];
    const entriesToReplace: INetworkAclProperties['entries'] = [];
    nAclEgressEntries.forEach((e) => {
      const index = propertiesEgressEntries.findIndex((pe) => pe.RuleNumber === e.RuleNumber);

      if (index === -1) {
        entriesToDelete.push(e);
      } else if (index >= 0 && !this.isNAclEntryEqual(e, propertiesEgressEntries[index])) {
        entriesToReplace.push(propertiesEgressEntries[index]);
      }
    });
    nAclIngressEntries.forEach((e) => {
      const index = propertiesIngressEntries.findIndex((pe) => pe.RuleNumber === e.RuleNumber);

      if (index === -1) {
        entriesToDelete.push(e);
      } else if (index >= 0 && !this.isNAclEntryEqual(e, propertiesIngressEntries[index])) {
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

  private isNAclEntryEqual(e: NetworkAclEntry, pe: INetworkAclProperties['entries'][0]): boolean {
    return (
      e.CidrBlock === pe.CidrBlock &&
      e.Egress === pe.Egress &&
      e.PortRange!.From === pe.PortRange.From &&
      e.PortRange!.To === pe.PortRange.To &&
      e.Protocol === pe.Protocol &&
      e.RuleAction === pe.RuleAction &&
      e.RuleNumber === pe.RuleNumber
    );
  }
}

@Factory<UpdateNetworkAclEntriesResourceAction>(UpdateNetworkAclEntriesResourceAction)
export class UpdateNetworkAclEntriesResourceActionFactory {
  static async create(): Promise<UpdateNetworkAclEntriesResourceAction> {
    return new UpdateNetworkAclEntriesResourceAction();
  }
}
