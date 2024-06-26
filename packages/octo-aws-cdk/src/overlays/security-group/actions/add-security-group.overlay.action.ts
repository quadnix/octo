import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import type { Vpc } from '../../../resources/vpc/vpc.resource.js';
import type { ISecurityGroupOverlayProperties } from '../security-group.overlay.interface.js';
import type { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(ModelType.OVERLAY)
export class AddSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties as unknown as ISecurityGroupOverlayProperties;

    return [`resource.vpc-${properties.regionId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'security-group-overlay' && diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties as unknown as ISecurityGroupOverlayProperties;
    const anchor = diff.value as SecurityGroupAnchor;

    const vpc = actionInputs[`resource.vpc-${properties.regionId}`] as Vpc;

    const securityGroup = new SecurityGroup(
      `sec-grp-${properties.regionId}-${anchor.anchorId}`,
      {
        awsRegionId: properties.awsRegionId,
        rules: anchor.rules,
      },
      [vpc],
    );

    const output: ActionOutputs = {};
    output[securityGroup.resourceId] = securityGroup;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddSecurityGroupOverlayAction>(AddSecurityGroupOverlayAction)
export class AddSecurityGroupOverlayActionFactory {
  static async create(): Promise<AddSecurityGroupOverlayAction> {
    return new AddSecurityGroupOverlayAction();
  }
}
