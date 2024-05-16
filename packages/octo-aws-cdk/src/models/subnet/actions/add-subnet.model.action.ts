import {
  Action,
  ActionInputs,
  ActionOutputs,
  Diff,
  DiffAction,
  EnableHook,
  Factory,
  IModelAction,
  ModelType,
  Subnet as SubnetModel,
  SubnetType,
} from '@quadnix/octo';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AwsRegion } from '../../region/aws.region.model.js';

@Action(ModelType.MODEL)
export class AddSubnetModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSubnetModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.model as SubnetModel;

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
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'subnet' && diff.field === 'subnetId';
  }

  @EnableHook('PostModelActionHook')
  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const subnet = diff.model as SubnetModel;

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

    // Create Route Table.
    const subnetRT = new RouteTable(
      `rt-${subnet.subnetId}`,
      { associateWithInternetGateway: subnet.subnetType === SubnetType.PUBLIC, awsRegionId: awsRegion.awsRegionId },
      [vpc, internetGateway, subnetSubnet],
    );

    // Create Network ACL.
    const subnetNAcl = new NetworkAcl(
      `nacl-${subnet.subnetId}`,
      {
        awsRegionId: awsRegion.awsRegionId,
        entries: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
            RuleNumber: 10,
          },
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
            RuleNumber: 10,
          },
        ],
      },
      [vpc, subnetSubnet],
    );

    const output: ActionOutputs = {};
    output[subnetSubnet.resourceId] = subnetSubnet;
    output[subnetRT.resourceId] = subnetRT;
    output[subnetNAcl.resourceId] = subnetNAcl;

    return output;
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
