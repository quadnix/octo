import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, IModelAction, ModelType } from '@quadnix/octo';
import { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { ISecurityGroupOverlayProperties } from '../security-group.overlay.interface.js';
import { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties as unknown as ISecurityGroupOverlayProperties;
    const anchor = diff.value as SecurityGroupAnchor;

    return [`resource.sec-grp-${properties.regionId}-${anchor.anchorId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties as unknown as ISecurityGroupOverlayProperties;
    const anchor = diff.value as SecurityGroupAnchor;

    const securityGroup = actionInputs[`resource.sec-grp-${properties.regionId}-${anchor.anchorId}`] as SecurityGroup;
    securityGroup.markDeleted();

    const output: ActionOutputs = {};
    output[securityGroup.resourceId] = securityGroup;

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
