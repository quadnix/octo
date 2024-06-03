import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import type { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import type { IamRole } from '../../../resources/iam/iam-role.resource.js';
import type { S3StorageAccessOverlay } from '../s3-storage-access.overlay.js';

@Action(ModelType.OVERLAY)
export class AddS3StorageAccessOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddS3StorageAccessOverlayAction';

  collectInput(diff: Diff): string[] {
    const s3StorageAccessOverlay = diff.model as S3StorageAccessOverlay;
    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors()[0] as IamRoleAnchor;

    return [`resource.iam-role-${iamRoleAnchor.anchorId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 's3-storage-access-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const s3StorageAccessOverlay = diff.model as S3StorageAccessOverlay;
    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors()[0] as IamRoleAnchor;
    const iamRole = actionInputs[`resource.iam-role-${iamRoleAnchor.anchorId}`] as IamRole;

    iamRole.updatePolicyDiff({
      [s3StorageAccessOverlay.overlayId]: { action: 'add', overlay: s3StorageAccessOverlay },
    });

    const output: ActionOutputs = {};
    output[iamRole.resourceId] = iamRole;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddS3StorageAccessOverlayAction>(AddS3StorageAccessOverlayAction)
export class AddS3StorageAccessOverlayActionFactory {
  static async create(): Promise<AddS3StorageAccessOverlayAction> {
    return new AddS3StorageAccessOverlayAction();
  }
}
