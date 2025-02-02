import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  SubnetType,
} from '@quadnix/octo';
import { InternetGatewaySchema } from '../../../../../../resources/internet-gateway/index.js';
import { NetworkAcl, type NetworkAclSchema } from '../../../../../../resources/network-acl/index.js';
import { RouteTable } from '../../../../../../resources/route-table/index.js';
import { Subnet } from '../../../../../../resources/subnet/index.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.js';
import { NetworkAclUtility } from '../../../../../../utilities/network-acl/network-acl.utility.js';
import { type AwsSubnetModule } from '../../../aws-subnet.module.js';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(AwsSubnet)
export class AddSubnetModelAction implements IModelAction<AwsSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnet &&
      (diff.node.constructor as typeof AwsSubnet).NODE_NAME === 'subnet' &&
      diff.field === 'subnetId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnet = diff.node as AwsSubnet;

    const { awsAccountId, awsRegionId } = actionInputs.metadata as Awaited<
      ReturnType<AwsSubnetModule['registerMetadata']>
    >;

    const subnetCidrBlock = actionInputs.inputs.subnetCidrBlock;
    const [vpc] = await subnet.getResourcesMatchingSchema(VpcSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);
    const [internetGateway] = await subnet.getResourcesMatchingSchema(InternetGatewaySchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);

    // Create Subnet.
    const subnetSubnet = new Subnet(
      `subnet-${subnet.subnetId}`,
      {
        AvailabilityZone: actionInputs.inputs.subnetAvailabilityZone,
        awsAccountId,
        awsRegionId,
        CidrBlock: subnetCidrBlock,
      },
      [vpc],
    );

    // Create Route Table.
    const subnetRT = new RouteTable(
      `rt-${subnet.subnetId}`,
      {
        associateWithInternetGateway: subnet.subnetType === SubnetType.PUBLIC,
        awsAccountId,
        awsRegionId,
      },
      [vpc, internetGateway, new MatchingResource(subnetSubnet, subnetSubnet.synth())],
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
    // Create Network ACL entries - public network.
    if (subnet.subnetType === SubnetType.PUBLIC) {
      const subnetNAclLastEntryRuleNumber = Math.max(...subnetNAclEntries.map((e) => e.RuleNumber), 0);
      subnetNAclEntries.push({
        CidrBlock: '0.0.0.0/0',
        Egress: false,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: Math.ceil(subnetNAclLastEntryRuleNumber / 10) * 10 + 1,
      });
      subnetNAclEntries.push({
        CidrBlock: subnetCidrBlock,
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: Math.ceil(subnetNAclLastEntryRuleNumber / 10) * 10 + 1,
      });
    } else {
      for (let i = subnetNAclEntries.length - 1; i >= 0; i--) {
        const entry = subnetNAclEntries[i];
        if (
          NetworkAclUtility.isNAclEntryEqual(entry, {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
          }) ||
          NetworkAclUtility.isNAclEntryEqual(entry, {
            CidrBlock: subnetCidrBlock,
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
      [vpc, new MatchingResource(subnetSubnet, subnetSubnet.synth())],
    );

    actionOutputs[subnetSubnet.resourceId] = subnetSubnet;
    actionOutputs[subnetRT.resourceId] = subnetRT;
    actionOutputs[subnetNAcl.resourceId] = subnetNAcl;
    return actionOutputs;
  }
}

@Factory<AddSubnetModelAction>(AddSubnetModelAction)
export class AddSubnetModelActionFactory {
  private static instance: AddSubnetModelAction;

  static async create(): Promise<AddSubnetModelAction> {
    if (!this.instance) {
      this.instance = new AddSubnetModelAction();
    }
    return this.instance;
  }
}
