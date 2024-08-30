import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import type { INetworkAclProperties } from '../../../resources/network-acl/network-acl.interface.js';
import type { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(NodeType.MODEL)
export class UpdateSubnetAssociationModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSubnetAssociationModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.node as AwsSubnet;
    const siblingSubnet = diff.value as AwsSubnet;

    return [`resource.subnet-${siblingSubnet.subnetId}`, `resource.nacl-${subnet.subnetId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnet &&
      diff.node.NODE_NAME === 'subnet' &&
      diff.field === 'sibling'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const subnet = diff.node as AwsSubnet;
    const siblingSubnet = diff.value as AwsSubnet;

    const siblingSubnetSubnet = actionInputs[`resource.subnet-${siblingSubnet.subnetId}`] as Subnet;
    const subnetNAcl = actionInputs[`resource.nacl-${subnet.subnetId}`] as NetworkAcl;

    const subnetNAclLastEntryRuleNumber = Math.max(...subnetNAcl.properties.entries.map((e) => e.RuleNumber), 0);

    // Create Network ACL entries.
    const subnetNAclEntries: INetworkAclProperties['entries'] = [];
    subnetNAclEntries.push({
      CidrBlock: siblingSubnetSubnet.properties.CidrBlock,
      Egress: false,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: Math.ceil(subnetNAclLastEntryRuleNumber / 10) * 10 + 1,
    });
    subnetNAclEntries.push({
      CidrBlock: siblingSubnetSubnet.properties.CidrBlock,
      Egress: true,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: Math.ceil(subnetNAclLastEntryRuleNumber / 10) * 10 + 1,
    });
    subnetNAcl.properties.entries.push(...subnetNAclEntries);

    actionOutputs[subnetNAcl.resourceId] = subnetNAcl;
    return actionOutputs;
  }
}

@Factory<UpdateSubnetAssociationModelAction>(UpdateSubnetAssociationModelAction)
export class UpdateSubnetAssociationModelActionFactory {
  static async create(): Promise<UpdateSubnetAssociationModelAction> {
    return new UpdateSubnetAssociationModelAction();
  }
}
