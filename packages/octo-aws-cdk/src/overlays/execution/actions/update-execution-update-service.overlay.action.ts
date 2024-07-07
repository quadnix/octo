import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  IModelAction,
  ModelType,
} from '@quadnix/octo';
import { EcsServiceAnchor } from '../../../anchors/ecs-service.anchor.js';
import { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import { EcsService } from '../../../resources/ecs/ecs-service.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { ExecutionOverlay } from '../execution.overlay.js';

@Action(ModelType.OVERLAY)
export class UpdateExecutionUpdateServiceOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateExecutionUpdateServiceOverlayAction';

  collectInput(diff: Diff): string[] {
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties;

    const securityGroupResources = executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SecurityGroupAnchor && a.properties.rules.length > 0)
      .map((a: SecurityGroupAnchor) => `resource.sec-grp-${a.properties.securityGroupName}`);

    return [`resource.ecs-service-${properties.regionId}-${properties.serverKey}`, ...securityGroupResources];
  }

  filter(diff: Diff): boolean {
    if (
      diff.model instanceof ExecutionOverlay &&
      diff.model.MODEL_NAME === 'execution-overlay' &&
      diff.field === 'anchor'
    ) {
      if (diff.value instanceof EcsServiceAnchor) {
        return diff.action === DiffAction.UPDATE;
      } else if (diff.value instanceof SecurityGroupAnchor) {
        return diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE || diff.action === DiffAction.UPDATE;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    // Get properties.
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties;

    // ECS Service Anchors.
    const ecsServiceAnchor = executionOverlay
      .getAnchors()
      .find((a) => a instanceof EcsServiceAnchor) as EcsServiceAnchor;
    const ecsServiceAnchorProperties = ecsServiceAnchor.properties;

    const ecsService = actionInputs[
      `resource.ecs-service-${properties.regionId}-${properties.serverKey}`
    ] as EcsService;

    // Update desired counts.
    ecsService.updateServiceDesiredCount(ecsServiceAnchorProperties.desiredCount);

    // Security Group Anchors.
    // Iterate though every security group anchors associated with this overlay to add respective SG as parent.
    const securityGroupList = executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SecurityGroupAnchor && a.properties.rules.length > 0)
      .map(
        (a: SecurityGroupAnchor) => actionInputs[`resource.sec-grp-${a.properties.securityGroupName}`] as SecurityGroup,
      );
    ecsService.updateServiceSecurityGroups(securityGroupList);
    actionOutputs[ecsService.resourceId] = ecsService;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<UpdateExecutionUpdateServiceOverlayAction>(UpdateExecutionUpdateServiceOverlayAction)
export class UpdateExecutionUpdateServiceOverlayActionFactory {
  static async create(): Promise<UpdateExecutionUpdateServiceOverlayAction> {
    return new UpdateExecutionUpdateServiceOverlayAction();
  }
}
