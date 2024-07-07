import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import type { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(ModelType.OVERLAY)
export class UpdateSecurityGroupAnchorOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const anchor = diff.value as SecurityGroupAnchor;

    return [`resource.sec-grp-${anchor.properties.securityGroupName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model instanceof SecurityGroupOverlay &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'anchor'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const anchor = diff.value as SecurityGroupAnchor;

    const securityGroup = actionInputs[`resource.sec-grp-${anchor.properties.securityGroupName}`] as SecurityGroup;
    securityGroup.properties.rules = [...anchor.properties.rules];
    actionOutputs[securityGroup.resourceId] = securityGroup;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<UpdateSecurityGroupAnchorOverlayAction>(UpdateSecurityGroupAnchorOverlayAction)
export class UpdateSecurityGroupAnchorOverlayActionFactory {
  static async create(): Promise<UpdateSecurityGroupAnchorOverlayAction> {
    return new UpdateSecurityGroupAnchorOverlayAction();
  }
}
