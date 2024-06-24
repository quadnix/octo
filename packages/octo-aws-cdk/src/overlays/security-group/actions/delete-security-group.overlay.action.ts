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
export class DeleteSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const anchors = securityGroupOverlay.getAnchors() as SecurityGroupAnchor[];

    const securityGroupResources = anchors
      .filter((a) => a.properties.rules.length > 0)
      .map((a) => `resource.sec-grp-${a.properties.securityGroupName}`);

    return [...securityGroupResources];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof SecurityGroupOverlay &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const anchors = securityGroupOverlay.getAnchors() as SecurityGroupAnchor[];

    const securityGroupResources = anchors
      .filter((a) => a.properties.rules.length > 0)
      .map((a) => `resource.sec-grp-${a.properties.securityGroupName}`);

    const output: ActionOutputs = {};

    for (const resource of securityGroupResources) {
      const securityGroup = actionInputs[resource] as SecurityGroup;
      securityGroup.remove();

      output[securityGroup.resourceId] = securityGroup;
    }

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteSecurityGroupOverlayAction>(DeleteSecurityGroupOverlayAction)
export class DeleteSecurityGroupOverlayActionFactory {
  static async create(): Promise<DeleteSecurityGroupOverlayAction> {
    return new DeleteSecurityGroupOverlayAction();
  }
}
