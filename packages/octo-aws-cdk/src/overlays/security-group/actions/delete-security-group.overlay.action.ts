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
export class DeleteSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const anchor = diff.value as SecurityGroupAnchor;

    return [`resource.sec-grp-${anchor.properties.securityGroupName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const anchor = diff.value as SecurityGroupAnchor;

    const securityGroup = actionInputs[`resource.sec-grp-${anchor.properties.securityGroupName}`] as SecurityGroup;
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
