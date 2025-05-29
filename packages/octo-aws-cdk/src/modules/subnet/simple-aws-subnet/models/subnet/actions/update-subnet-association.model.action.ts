import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  SubnetType,
} from '@quadnix/octo';
import { NatGatewaySchema } from '../../../../../../resources/nat-gateway/nat-gateway.schema.js';
import type { NetworkAcl } from '../../../../../../resources/network-acl/index.js';
import { NetworkAclSchema } from '../../../../../../resources/network-acl/network-acl.schema.js';
import { RouteTable } from '../../../../../../resources/route-table/index.js';
import type { AwsSubnetModule } from '../../../aws-subnet.module.js';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(AwsSubnet)
export class UpdateSubnetAssociationModelAction implements IModelAction<AwsSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnet &&
      (diff.node.constructor as typeof AwsSubnet).NODE_NAME === 'subnet' &&
      diff.field === 'sibling'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnet = diff.node as AwsSubnet;
    const siblingSubnet = diff.value as AwsSubnet;

    const siblingSubnetInputs = actionInputs.inputs.subnetSiblings || [];
    const siblingSubnetInput = siblingSubnetInputs.find((s) => s.subnetName === siblingSubnet.subnetName)!;
    const subnetRouteTable = actionInputs.resources[`rt-${subnet.subnetId}`] as RouteTable;
    const subnetNAcl = actionInputs.resources[`nacl-${subnet.subnetId}`] as NetworkAcl;
    const [matchingSiblingSubnetNatGateway] = await siblingSubnet.getResourcesMatchingSchema(NatGatewaySchema, [], [], {
      searchBoundaryMembers: false,
    });
    const [matchingSiblingSubnetNAcl] = await siblingSubnet.getResourcesMatchingSchema(NetworkAclSchema, [], [], {
      searchBoundaryMembers: false,
    });

    // Create Network ACL entries on subnet NAcl.
    const subnetNAclEntries: NetworkAclSchema['properties']['entries'] = [];
    subnetNAclEntries.push({
      CidrBlock: siblingSubnetInput.subnetCidrBlock,
      Egress: false,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: -1,
    });
    subnetNAclEntries.push({
      CidrBlock: siblingSubnetInput.subnetCidrBlock,
      Egress: true,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: -1,
    });

    // Create Network ACL entries on sibling subnet NAcl.
    const siblingSubnetNAclEntries: NetworkAclSchema['properties']['entries'] = [];
    siblingSubnetNAclEntries.push({
      CidrBlock: actionInputs.inputs.subnetCidrBlock,
      Egress: false,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: -1,
    });
    siblingSubnetNAclEntries.push({
      CidrBlock: actionInputs.inputs.subnetCidrBlock,
      Egress: true,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: -1,
    });

    if (
      subnet.subnetType === SubnetType.PRIVATE &&
      siblingSubnet.subnetType === SubnetType.PUBLIC &&
      siblingSubnet.createNatGateway &&
      siblingSubnetInput.attachToNatGateway
    ) {
      // Create route table entries on subnet route table to allow traffic to NAT Gateway.
      subnetRouteTable.addRouteToNatGateway(matchingSiblingSubnetNatGateway);

      // Also create Network ACL entries on subnet NAcl to allow Egress/Ingress traffic to the internet.
      subnetNAclEntries.push({
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        PortRange: { From: -1, To: -1 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: -1,
      });
      subnetNAclEntries.push({
        CidrBlock: '0.0.0.0/0',
        Egress: false,
        PortRange: { From: 1024, To: 65535 },
        Protocol: '-1', // All.
        RuleAction: 'allow',
        RuleNumber: -1,
      });
    }

    subnetNAcl.updateNaclEntries(subnetNAclEntries);
    (matchingSiblingSubnetNAcl.getActual() as NetworkAcl).updateNaclEntries(siblingSubnetNAclEntries);

    if (siblingSubnet.subnetType === SubnetType.PUBLIC && siblingSubnet.createNatGateway) {
      actionOutputs[subnetRouteTable.resourceId] = subnetRouteTable;
    }
    actionOutputs[subnetNAcl.resourceId] = subnetNAcl;
    actionOutputs[matchingSiblingSubnetNAcl.getActual().resourceId] = subnetNAcl;
    return actionOutputs;
  }
}

@Factory<UpdateSubnetAssociationModelAction>(UpdateSubnetAssociationModelAction)
export class UpdateSubnetAssociationModelActionFactory {
  private static instance: UpdateSubnetAssociationModelAction;

  static async create(): Promise<UpdateSubnetAssociationModelAction> {
    if (!this.instance) {
      this.instance = new UpdateSubnetAssociationModelAction();
    }
    return this.instance;
  }
}
