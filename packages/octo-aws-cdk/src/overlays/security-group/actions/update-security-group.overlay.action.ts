import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import type { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import type { ISecurityGroupOverlayProperties } from '../security-group.overlay.interface.js';
import type { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(ModelType.OVERLAY)
export class UpdateSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties as unknown as ISecurityGroupOverlayProperties;
    const anchor = diff.value as SecurityGroupAnchor;

    return [`resource.sec-grp-${properties.regionId}-${anchor.anchorId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties as unknown as ISecurityGroupOverlayProperties;
    const anchor = diff.value as SecurityGroupAnchor;

    const securityGroup = actionInputs[`resource.sec-grp-${properties.regionId}-${anchor.anchorId}`] as SecurityGroup;
    securityGroup.properties.rules = anchor.rules;

    const output: ActionOutputs = {};
    output[securityGroup.resourceId] = securityGroup;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<UpdateSecurityGroupOverlayAction>(UpdateSecurityGroupOverlayAction)
export class UpdateSecurityGroupOverlayActionFactory {
  static async create(): Promise<UpdateSecurityGroupOverlayAction> {
    return new UpdateSecurityGroupOverlayAction();
  }
}
