import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
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

@Action(ModelType.MODEL)
export class AddSubnetModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSubnetModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.model as AwsSubnet;

    const parents = subnet.getParents();
    const awsRegion = parents['region'][0].to as AwsRegion;
    const regionId = awsRegion.regionId;

    const siblings = subnet.getSiblings()['subnet'] ?? [];
    const siblingSubnets = siblings.map((s) => s.to as AwsSubnet);

    return [
      `input.region.${regionId}.subnet.${subnet.subnetName}.CidrBlock`,
      `resource.vpc-${regionId}`,
      `resource.igw-${regionId}`,
      ...siblingSubnets.map((s) => `resource.subnet-${s.subnetId}`),
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof AwsSubnet &&
      diff.model.MODEL_NAME === 'subnet' &&
      diff.field === 'subnetId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const subnet = diff.model as AwsSubnet;

    const parents = subnet.getParents();
    const awsRegion = parents['region'][0].to as AwsRegion;
    const regionId = awsRegion.regionId;

    const siblings = subnet.getSiblings()['subnet'] ?? [];
    const siblingSubnets = siblings.map((s) => s.to as AwsSubnet);

    const subnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.${subnet.subnetName}.CidrBlock`] as string;
    const vpc = actionInputs[`resource.vpc-${regionId}`] as Vpc;
    const internetGateway = actionInputs[`resource.igw-${regionId}`] as InternetGateway;
    const siblingSubnetsSubnet = siblingSubnets.map((s) => actionInputs[`resource.subnet-${s.subnetId}`] as Subnet);

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

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddSubnetModelAction>(AddSubnetModelAction)
export class AddSubnetModelActionFactory {
  static async create(): Promise<AddSubnetModelAction> {
    return new AddSubnetModelAction();
  }
}
