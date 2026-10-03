import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  type Region,
  hasNodeName,
} from '@quadnix/octo';
import { SecurityGroup } from '../../../../../../resources/security-group/index.js';
import type { SecurityGroupSchema } from '../../../../../../resources/security-group/index.schema.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import type { AwsEcsExecutionModule } from '../../../aws-ecs-execution.module.js';
import { AwsEcsExecutionServerSecurityGroupOverlay } from '../aws-ecs-execution-server-security-group.overlay.js';

/**
 * @internal
 */
@Action(AwsEcsExecutionServerSecurityGroupOverlay)
export class AddAwsEcsExecutionServerSecurityGroupOverlayAction implements IModelAction<AwsEcsExecutionModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsExecutionServerSecurityGroupOverlay &&
      hasNodeName(diff.node, 'aws-ecs-execution-server-security-group-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsEcsExecutionServerSecurityGroupOverlay>,
    actionInputs: EnhancedModuleSchema<AwsEcsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.node;
    const [executionSecurityGroupAnchor, ...serverSecurityGroupAnchors] = securityGroupOverlay.anchors;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    // Get the VPC from the region of the execution's subnet.
    const region = actionInputs.inputs.subnet.getParents()['region'][0].to as Region;
    const [matchingVpcResource] = await region.getResourcesMatchingSchema(VpcSchema, [], [], {
      searchBoundaryMembers: false,
    });

    // Collect the rules of the execution and of each server it runs, once each.
    const rules: SecurityGroupSchema['properties']['rules'] = [];
    for (const anchorRules of [
      executionSecurityGroupAnchor.properties.rules,
      ...serverSecurityGroupAnchors.map((a) => a.getSchemaInstance().properties.rules),
    ]) {
      for (const rule of anchorRules) {
        const existingRule = rules.find(
          (r) =>
            r.CidrBlock === rule.CidrBlock &&
            r.Egress === rule.Egress &&
            r.FromPort === rule.FromPort &&
            r.IpProtocol === rule.IpProtocol &&
            r.ToPort === rule.ToPort,
        );
        if (!existingRule) {
          rules.push({
            CidrBlock: rule.CidrBlock,
            Egress: rule.Egress,
            FromPort: rule.FromPort,
            IpProtocol: rule.IpProtocol,
            ToPort: rule.ToPort,
          });
        }
      }
    }

    // Create the execution's one security group.
    const securityGroup = new SecurityGroup(
      `sec-grp-${executionSecurityGroupAnchor.properties.securityGroupName}`,
      { awsAccountId, awsRegionId, rules },
      [matchingVpcResource],
    );

    actionOutputs[securityGroup.resourceId] = securityGroup;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsExecutionServerSecurityGroupOverlayAction>(AddAwsEcsExecutionServerSecurityGroupOverlayAction)
export class AddAwsEcsExecutionServerSecurityGroupOverlayActionFactory {
  private static instance: AddAwsEcsExecutionServerSecurityGroupOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsEcsExecutionServerSecurityGroupOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsExecutionServerSecurityGroupOverlayAction();
    }
    return this.instance;
  }
}
