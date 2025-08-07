import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  SubnetType,
  hasNodeName,
} from '@quadnix/octo';
import { NatGatewaySchema } from '../../../../../../resources/nat-gateway/index.schema.js';
import type { NetworkAcl } from '../../../../../../resources/network-acl/index.js';
import { NetworkAclSchema } from '../../../../../../resources/network-acl/index.schema.js';
import { RouteTable } from '../../../../../../resources/route-table/index.js';
import { SubnetSchema } from '../../../../../../resources/subnet/index.schema.js';
import type { AwsSimpleSubnetModule } from '../../../aws-simple-subnet.module.js';
import { AwsSimpleSubnet } from '../aws-simple-subnet.model.js';

/**
 * @internal
 */
@Action(AwsSimpleSubnet)
export class UpdateAwsSimpleSubnetAssociationModelAction implements IModelAction<AwsSimpleSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSimpleSubnet &&
      hasNodeName(diff.node, 'subnet') &&
      diff.field === 'sibling'
    );
  }

  async handle(
    diff: Diff<AwsSimpleSubnet, AwsSimpleSubnet>,
    actionInputs: EnhancedModuleSchema<AwsSimpleSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnet = diff.node;
    const subnetRouteTable = actionInputs.resources[`rt-${subnet.subnetId}`] as RouteTable;
    const subnetNAcl = actionInputs.resources[`nacl-${subnet.subnetId}`] as NetworkAcl;

    const siblingSubnet = diff.value;
    const siblingSubnetInputs = actionInputs.inputs.subnetSiblings || [];
    const siblingSubnetInput = siblingSubnetInputs.find((s) => s.subnet.subnetId === siblingSubnet.subnetId)!;
    const [matchingSiblingSubnetNatGateway] = await siblingSubnet.getResourcesMatchingSchema(NatGatewaySchema, [], [], {
      searchBoundaryMembers: false,
    });
    const [matchingSiblingSubnetNAcl] = await siblingSubnet.getResourcesMatchingSchema(NetworkAclSchema, [], [], {
      searchBoundaryMembers: false,
    });
    const [matchingSiblingSubnetSubnet] = await siblingSubnet.getResourcesMatchingSchema(SubnetSchema, [], [], {
      searchBoundaryMembers: false,
    });
    const siblingSubnetCidrBlock = matchingSiblingSubnetSubnet.getSchemaInstance().properties.CidrBlock;

    // Create Network ACL entries on subnet NAcl.
    const subnetNAclEntries: NetworkAclSchema['properties']['entries'] = [];
    subnetNAclEntries.push({
      CidrBlock: siblingSubnetCidrBlock,
      Egress: false,
      PortRange: { From: -1, To: -1 },
      Protocol: '-1', // All.
      RuleAction: 'allow',
      RuleNumber: -1,
    });
    subnetNAclEntries.push({
      CidrBlock: siblingSubnetCidrBlock,
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

/**
 * @internal
 */
@Factory<UpdateAwsSimpleSubnetAssociationModelAction>(UpdateAwsSimpleSubnetAssociationModelAction)
export class UpdateAwsSimpleSubnetAssociationModelActionFactory {
  private static instance: UpdateAwsSimpleSubnetAssociationModelAction;

  static async create(): Promise<UpdateAwsSimpleSubnetAssociationModelAction> {
    if (!this.instance) {
      this.instance = new UpdateAwsSimpleSubnetAssociationModelAction();
    }
    return this.instance;
  }
}
