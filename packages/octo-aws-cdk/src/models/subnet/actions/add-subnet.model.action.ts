import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
  SubnetType,
} from '@quadnix/octo';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import type { INetworkAclProperties } from '../../../resources/network-acl/network-acl.interface.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import type { AwsRegion } from '../../region/aws.region.model.js';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(NodeType.MODEL)
export class AddSubnetModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSubnetModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.node as AwsSubnet;

    const parents = subnet.getParents();
    const awsRegion = parents['region'][0].to as AwsRegion;
    const regionId = awsRegion.regionId;

    return [
      `input.region.${regionId}.subnet.${subnet.subnetName}.CidrBlock`,
      `resource.vpc-${regionId}`,
      `resource.igw-${regionId}`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnet &&
      diff.node.NODE_NAME === 'subnet' &&
      diff.field === 'subnetId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const subnet = diff.node as AwsSubnet;

    const parents = subnet.getParents();
    const awsRegion = parents['region'][0].to as AwsRegion;
    const regionId = awsRegion.regionId;

    const subnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.${subnet.subnetName}.CidrBlock`] as string;
    const vpc = actionInputs[`resource.vpc-${regionId}`] as Vpc;
    const internetGateway = actionInputs[`resource.igw-${regionId}`] as InternetGateway;

    // Create Subnet.
    const subnetSubnet = new Subnet(
      `subnet-${subnet.subnetId}`,
      {
        AvailabilityZone: awsRegion.awsRegionAZ,
        awsRegionId: awsRegion.awsRegionId,
        CidrBlock: subnetCidrBlock,
      },
      [vpc],
    );
    actionOutputs[subnetSubnet.resourceId] = subnetSubnet;

    // Create Route Table.
    const subnetRT = new RouteTable(
      `rt-${subnet.subnetId}`,
      { associateWithInternetGateway: subnet.subnetType === SubnetType.PUBLIC, awsRegionId: awsRegion.awsRegionId },
      [vpc, internetGateway, subnetSubnet],
    );
    actionOutputs[subnetRT.resourceId] = subnetRT;

    // Create Network ACL entries.
    const subnetNAclEntries: INetworkAclProperties['entries'] = [];
    if (subnet.disableSubnetIntraNetwork) {
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: 1,
      });
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: 1,
      });
    }

    // Create Network ACL.
    const subnetNAcl = new NetworkAcl(
      `nacl-${subnet.subnetId}`,
      {
        awsRegionId: awsRegion.awsRegionId,
        entries: subnetNAclEntries,
      },
      [vpc, subnetSubnet],
    );
    actionOutputs[subnetNAcl.resourceId] = subnetNAcl;

    return actionOutputs;
  }
}

@Factory<AddSubnetModelAction>(AddSubnetModelAction)
export class AddSubnetModelActionFactory {
  static async create(): Promise<AddSubnetModelAction> {
    return new AddSubnetModelAction();
  }
}
