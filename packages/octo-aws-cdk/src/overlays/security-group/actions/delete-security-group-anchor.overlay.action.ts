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
export class DeleteSecurityGroupAnchorOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupAnchorOverlayAction';

  collectInput(diff: Diff): string[] {
    const anchor = diff.value as SecurityGroupAnchor;

    return anchor.properties.rules.length > 0 ? [`resource.sec-grp-${anchor.properties.securityGroupName}`] : [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof SecurityGroupOverlay &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'anchor'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const anchor = diff.value as SecurityGroupAnchor;

    if (anchor.properties.rules.length > 0) {
      const securityGroup = actionInputs[`resource.sec-grp-${anchor.properties.securityGroupName}`] as SecurityGroup;
      securityGroup.remove();
      actionOutputs[securityGroup.resourceId] = securityGroup;
    }

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteSecurityGroupAnchorOverlayAction>(DeleteSecurityGroupAnchorOverlayAction)
export class DeleteSecurityGroupAnchorOverlayActionFactory {
  static async create(): Promise<DeleteSecurityGroupAnchorOverlayAction> {
    return new DeleteSecurityGroupAnchorOverlayAction();
  }
}
