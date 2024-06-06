import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  EnableHook,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import type { INetworkAclProperties } from '../../../resources/network-acl/network-acl.interface.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import type { ISubnetProperties } from '../../../resources/subnet/subnet.interface.js';
import type { Subnet } from '../../../resources/subnet/subnet.resource.js';
import type { AwsSubnet } from '../aws.subnet.model.js';

@Action(ModelType.MODEL)
export class UpdateSubnetAssociationModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSubnetAssociationModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.model as AwsSubnet;

    const siblings = subnet.getSiblings()['subnet'] ?? [];
    const siblingSubnets = siblings.map((s) => s.to as AwsSubnet);

    return [
      `resource.subnet-${subnet.subnetId}`,
      `resource.nacl-${subnet.subnetId}`,
      ...siblingSubnets.map((s) => `resource.subnet-${s.subnetId}`),
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'subnet' &&
      (diff.field === 'association' || diff.field === 'disableSubnetIntraNetwork')
    );
  }

  @EnableHook('PostModelActionHook')
  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const subnet = diff.model as AwsSubnet;

    const siblings = subnet.getSiblings()['subnet'] ?? [];
    const siblingSubnets = siblings.map((s) => s.to as AwsSubnet);

    const subnetSubnet = actionInputs[`resource.subnet-${subnet.subnetId}`] as Subnet;
    const subnetNAcl = actionInputs[`resource.nacl-${subnet.subnetId}`] as NetworkAcl;
    const siblingSubnetsSubnet = siblingSubnets.map((s) => actionInputs[`resource.subnet-${s.subnetId}`] as Subnet);

    // Create Network ACL entries.
    const subnetNAclEntries: INetworkAclProperties['entries'] = [];
    if (subnet.disableSubnetIntraNetwork) {
      subnetNAclEntries.push({
        CidrBlock: (subnetSubnet.properties as unknown as ISubnetProperties).CidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: 1,
      });
      subnetNAclEntries.push({
        CidrBlock: (subnetSubnet.properties as unknown as ISubnetProperties).CidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: 1,
      });
    }
    siblingSubnetsSubnet.forEach((s, i) => {
      subnetNAclEntries.push({
        CidrBlock: (s.properties as unknown as ISubnetProperties).CidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: (i + 1) * 10,
      });
      subnetNAclEntries.push({
        CidrBlock: (s.properties as unknown as ISubnetProperties).CidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: (i + 1) * 10,
      });
    });

    // Update Network ACL entries.
    (subnetNAcl.properties as unknown as INetworkAclProperties).entries = subnetNAclEntries;

    const output: ActionOutputs = {};
    output[subnetNAcl.resourceId] = subnetNAcl;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<UpdateSubnetAssociationModelAction>(UpdateSubnetAssociationModelAction)
export class UpdateSubnetAssociationModelActionFactory {
  static async create(): Promise<UpdateSubnetAssociationModelAction> {
    return new UpdateSubnetAssociationModelAction();
  }
}
