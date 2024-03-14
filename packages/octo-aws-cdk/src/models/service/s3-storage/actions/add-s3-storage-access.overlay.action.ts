import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamRoleAnchor } from '../../../../anchors/iam-role.anchor.model.js';
import { IamRole } from '../../../../resources/iam/iam-role.resource.js';
import { AAction } from '../../../action.abstract.js';
import { S3StorageAccessOverlay } from '../s3-storage-access.overlay.js';

@Action(ModelType.OVERLAY)
export class AddS3StorageAccessOverlayAction extends AAction {
  readonly ACTION_NAME: string = 'AddS3StorageAccessOverlayAction';

  override collectInput(diff: Diff): string[] {
    const s3StorageAccessOverlay = diff.model as S3StorageAccessOverlay;
    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors()[0] as IamRoleAnchor;

    return [`resource.iam-role-${iamRoleAnchor.anchorId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 's3-storage-access' && diff.field === 'overlayId'
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
}

@Factory<AddS3StorageAccessOverlayAction>(AddS3StorageAccessOverlayAction)
export class AddS3StorageAccessOverlayActionFactory {
  static async create(): Promise<AddS3StorageAccessOverlayAction> {
    return new AddS3StorageAccessOverlayAction();
  }
}
