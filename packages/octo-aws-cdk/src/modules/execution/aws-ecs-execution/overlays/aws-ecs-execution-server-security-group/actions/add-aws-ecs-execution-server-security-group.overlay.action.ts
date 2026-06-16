import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingAnchor,
  hasNodeName,
} from '@quadnix/octo';
import { SecurityGroup } from '../../../../../../resources/security-group/index.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import type { AwsEcsExecutionModule } from '../../../aws-ecs-execution.module.js';
import { AwsEcsExecutionServerSecurityGroupOverlay } from '../aws-ecs-execution-server-security-group.overlay.js';

/**
 * @internal
 */
@Action(AwsEcsExecutionServerSecurityGroupOverlay)
export class AddAwsEcsExecutionServerSecurityGroupOverlayAction implements IModelAction<AwsEcsExecutionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsExecutionServerSecurityGroupOverlay &&
      hasNodeName(diff.node, 'aws-ecs-execution-server-security-group-overlay') &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff<AwsEcsExecutionServerSecurityGroupOverlay>,
    actionInputs: EnhancedModuleSchema<AwsEcsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.node;
    const anchors = securityGroupOverlay.anchors;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const [matchingVpcResource] = await securityGroupOverlay.getResourcesMatchingSchema(VpcSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);

    for (const anchor of anchors) {
      const anchorProperties = (anchor instanceof MatchingAnchor ? anchor.getSchemaInstance() : anchor).properties;

      const securityGroup = new SecurityGroup(
        `sec-grp-${anchorProperties.securityGroupName}`,
        {
          awsAccountId,
          awsRegionId,
          rules: anchorProperties.rules.map((rule) => ({
            CidrBlock: rule.CidrBlock,
            Egress: rule.Egress,
            FromPort: rule.FromPort,
            IpProtocol: rule.IpProtocol,
            ToPort: rule.ToPort,
          })),
        },
        [matchingVpcResource],
      );

      actionOutputs[securityGroup.resourceId] = securityGroup;
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsExecutionServerSecurityGroupOverlayAction>(AddAwsEcsExecutionServerSecurityGroupOverlayAction)
export class AddAwsEcsExecutionServerSecurityGroupOverlayActionFactory {
  private static instance: AddAwsEcsExecutionServerSecurityGroupOverlayAction;

  static async create(): Promise<AddAwsEcsExecutionServerSecurityGroupOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsExecutionServerSecurityGroupOverlayAction();
    }
    return this.instance;
  }
}
