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
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import type { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(NodeType.MODEL)
export class UpdateSubnetAssociationModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSubnetAssociationModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.node as AwsSubnet;

    const siblings = subnet.getSiblings()['subnet'] ?? [];
    const siblingSubnets = siblings.map((s) => s.to as AwsSubnet);

    return [
      `resource.subnet-${subnet.subnetId}`,
      `resource.nacl-${subnet.subnetId}`,
      ...siblingSubnets.map((s) => `resource.subnet-${s.subnetId}`),
    ];
  }

  filter(diff: Diff): boolean {
    if (diff.node instanceof AwsSubnet && diff.node.NODE_NAME === 'subnet') {
      if (diff.field === 'disableSubnetIntraNetwork') {
        return diff.action === DiffAction.UPDATE;
      } else if (diff.field === 'sibling') {
        return diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const subnet = diff.node as AwsSubnet;

    const siblings = subnet.getSiblings()['subnet'] ?? [];
    const siblingSubnets = siblings.map((s) => s.to as AwsSubnet);

    const subnetSubnet = actionInputs[`resource.subnet-${subnet.subnetId}`] as Subnet;
    const subnetNAcl = actionInputs[`resource.nacl-${subnet.subnetId}`] as NetworkAcl;
    const siblingSubnetsSubnet = siblingSubnets.map((s) => actionInputs[`resource.subnet-${s.subnetId}`] as Subnet);

    // Create Network ACL entries.
    const subnetNAclEntries: INetworkAclProperties['entries'] = [];
    if (subnet.disableSubnetIntraNetwork) {
      subnetNAclEntries.push({
        CidrBlock: subnetSubnet.properties.CidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: 1,
      });
      subnetNAclEntries.push({
        CidrBlock: subnetSubnet.properties.CidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: 1,
      });
    }
    siblingSubnetsSubnet.forEach((s, i) => {
      subnetNAclEntries.push({
        CidrBlock: s.properties.CidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: (i + 1) * 10,
      });
      subnetNAclEntries.push({
        CidrBlock: s.properties.CidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: (i + 1) * 10,
      });
    });

    // Update Network ACL entries.
    subnetNAcl.properties.entries = subnetNAclEntries;
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
