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
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import type { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(ModelType.OVERLAY)
export class AddSecurityGroupAnchorOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupAnchorOverlayAction';

  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties;

    return [`resource.vpc-${properties.regionId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof SecurityGroupOverlay &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'anchor'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.model as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties;
    const anchor = diff.value as SecurityGroupAnchor;

    const vpc = actionInputs[`resource.vpc-${properties.regionId}`] as Vpc;

    const securityGroup = new SecurityGroup(
      `sec-grp-${anchor.properties.securityGroupName}`,
      {
        awsRegionId: properties.awsRegionId,
        rules: anchor.properties.rules,
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

@Factory<AddSecurityGroupAnchorOverlayAction>(AddSecurityGroupAnchorOverlayAction)
export class AddSecurityGroupAnchorOverlayActionFactory {
  static async create(): Promise<AddSecurityGroupAnchorOverlayAction> {
    return new AddSecurityGroupAnchorOverlayAction();
  }
}
