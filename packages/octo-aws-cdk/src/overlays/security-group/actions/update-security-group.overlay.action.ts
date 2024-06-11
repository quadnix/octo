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

@Action(ModelType.OVERLAY)
export class UpdateSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const anchor = diff.value as SecurityGroupAnchor;

    return [`resource.sec-grp-${anchor.properties.securityGroupName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const anchor = diff.value as SecurityGroupAnchor;

    const securityGroup = actionInputs[`resource.sec-grp-${anchor.properties.securityGroupName}`] as SecurityGroup;
    securityGroup.properties.rules = [...anchor.properties.rules];

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
