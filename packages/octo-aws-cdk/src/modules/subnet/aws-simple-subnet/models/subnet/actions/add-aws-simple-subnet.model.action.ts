import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  ModelActionExceptionTransactionError,
  SubnetType,
  hasNodeName,
} from '@quadnix/octo';
import { InternetGatewaySchema } from '../../../../../../resources/internet-gateway/index.schema.js';
import { NatGateway } from '../../../../../../resources/nat-gateway/index.js';
import { NetworkAcl } from '../../../../../../resources/network-acl/index.js';
import type { NetworkAclSchema } from '../../../../../../resources/network-acl/index.schema.js';
import { RouteTable } from '../../../../../../resources/route-table/index.js';
import { Subnet } from '../../../../../../resources/subnet/index.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import { NetworkAclUtility } from '../../../../../../utilities/network-acl/network-acl.utility.js';
import type { AwsSimpleSubnetModule } from '../../../aws-simple-subnet.module.js';
import { AwsSimpleSubnet } from '../aws-simple-subnet.model.js';

/**
 * @internal
 */
@Action(AwsSimpleSubnet)
export class AddAwsSimpleSubnetModelAction implements IModelAction<AwsSimpleSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSimpleSubnet &&
      hasNodeName(diff.node, 'subnet') &&
      diff.field === 'subnetId'
    );
  }

  async handle(
    diff: Diff<AwsSimpleSubnet>,
    actionInputs: EnhancedModuleSchema<AwsSimpleSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnet = diff.node;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const subnetCidrBlock = actionInputs.inputs.subnetCidrBlock;
    const [matchingVpcResource] = await subnet.getResourcesMatchingSchema(VpcSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);
    if (!matchingVpcResource) {
      throw new ModelActionExceptionTransactionError(
        `Vpc in account "${awsAccountId}" and region "${awsRegionId}" not found!`,
        diff,
        this.constructor.name,
      );
    }
    const [matchingInternetGatewayResource] = await subnet.getResourcesMatchingSchema(InternetGatewaySchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);
    if (!matchingInternetGatewayResource) {
      throw new ModelActionExceptionTransactionError(
        `InternetGateway in account "${awsAccountId}" and region "${awsRegionId}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    // Create Subnet.
    const subnetSubnet = new Subnet(
      `subnet-${subnet.subnetId}`,
      {
        AvailabilityZone: actionInputs.inputs.subnetAvailabilityZone,
        awsAccountId,
        awsRegionId,
        CidrBlock: subnetCidrBlock,
        subnetName: subnet.subnetName,
      },
      [matchingVpcResource],
    );

    // Create NAT Gateway.
    let subnetNatGateway: NatGateway | undefined;
    if (subnet.createNatGateway) {
      subnetNatGateway = new NatGateway(
        `nat-gateway-${subnet.subnetId}`,
        {
          awsAccountId,
          awsRegionId,
          ConnectivityType: 'public',
        },
        [matchingVpcResource, matchingInternetGatewayResource, new MatchingResource(subnetSubnet)],
      );
    }

    // Create Route Table.
    const subnetRT = new RouteTable(
      `rt-${subnet.subnetId}`,
      {
        associateWithInternetGateway: subnet.subnetType === SubnetType.PUBLIC,
        awsAccountId,
        awsRegionId,
      },
      [matchingVpcResource, matchingInternetGatewayResource, new MatchingResource(subnetSubnet)],
    );

    // Create Network ACL entries - intra network.
    const subnetNAclEntries: NetworkAclSchema['properties']['entries'] = [];
    if (subnet.disableSubnetIntraNetwork) {
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: -1,
      });
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'deny',
        RuleNumber: -1,
      });
    } else {
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: -1,
      });
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: -1,
      });
    }
    // Create Network ACL entries - public network.
    if (subnet.subnetType === SubnetType.PUBLIC) {
      subnetNAclEntries.push({
        CidrBlock: '0.0.0.0/0',
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: -1,
      });
      subnetNAclEntries.push({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: -1,
      });
    } else {
      for (let i = subnetNAclEntries.length - 1; i >= 0; i--) {
        const entry = subnetNAclEntries[i];
        // Remove Network ACL entries - public network.
        if (
          NetworkAclUtility.isNAclEntryEqual(entry, {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
          }) ||
          NetworkAclUtility.isNAclEntryEqual(entry, {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
          })
        ) {
          subnetNAclEntries.splice(i, 1);
        }
      }
    }

    // Create Network ACL.
    const subnetNAcl = new NetworkAcl(
      `nacl-${subnet.subnetId}`,
      {
        awsAccountId,
        awsRegionId,
        entries: subnetNAclEntries,
      },
      [matchingVpcResource, new MatchingResource(subnetSubnet)],
    );

    actionOutputs[subnetSubnet.resourceId] = subnetSubnet;
    if (subnetNatGateway) {
      actionOutputs[subnetNatGateway.resourceId] = subnetNatGateway;
    }
    actionOutputs[subnetRT.resourceId] = subnetRT;
    actionOutputs[subnetNAcl.resourceId] = subnetNAcl;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsSimpleSubnetModelAction>(AddAwsSimpleSubnetModelAction)
export class AddAwsSimpleSubnetModelActionFactory {
  private static instance: AddAwsSimpleSubnetModelAction;

  static async create(): Promise<AddAwsSimpleSubnetModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsSimpleSubnetModelAction();
    }
    return this.instance;
  }
}
