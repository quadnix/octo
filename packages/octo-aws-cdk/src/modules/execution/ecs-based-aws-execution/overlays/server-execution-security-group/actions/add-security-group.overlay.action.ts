import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingAnchor,
} from '@quadnix/octo';
import { SecurityGroup } from '../../../../../../resources/security-group/index.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import type { AwsExecutionModule } from '../../../aws-execution.module.js';
import { ServerExecutionSecurityGroupOverlay } from '../server-execution-security-group.overlay.js';

@Action(ServerExecutionSecurityGroupOverlay)
export class AddSecurityGroupOverlayAction implements IModelAction<AwsExecutionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof ServerExecutionSecurityGroupOverlay &&
      (diff.node.constructor as typeof ServerExecutionSecurityGroupOverlay).NODE_NAME ===
        'server-execution-security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.node as ServerExecutionSecurityGroupOverlay;
    const anchors = securityGroupOverlay.anchors;

    const { awsAccountId, awsRegionId } = actionInputs.metadata as Awaited<
      ReturnType<AwsExecutionModule['registerMetadata']>
    >;

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

@Factory<AddSecurityGroupOverlayAction>(AddSecurityGroupOverlayAction)
export class AddSecurityGroupOverlayActionFactory {
  private static instance: AddSecurityGroupOverlayAction;

  static async create(): Promise<AddSecurityGroupOverlayAction> {
    if (!this.instance) {
      this.instance = new AddSecurityGroupOverlayAction();
    }
    return this.instance;
  }
}
