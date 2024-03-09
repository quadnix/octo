import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamUserAnchor } from '../../../../anchors/iam-user.anchor.model.js';
import { IamUser } from '../../../../resources/iam/iam-user.resource.js';
import { AAction } from '../../../action.abstract.js';
import { S3StorageAccessOverlay } from '../s3-storage-access.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteS3StorageAccessOverlayAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteS3StorageAccessOverlayAction';

  override collectInput(diff: Diff): string[] {
    const s3StorageAccessOverlay = diff.model as S3StorageAccessOverlay;
    const iamUserAnchor = s3StorageAccessOverlay.getAnchors()[0] as IamUserAnchor;

    return [`resource.iam-user-${iamUserAnchor.anchorId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 's3-storage-access' && diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const s3StorageAccessOverlay = diff.model as S3StorageAccessOverlay;
    const iamUserAnchor = s3StorageAccessOverlay.getAnchors()[0] as IamUserAnchor;
    const iamUser = actionInputs[`resource.iam-user-${iamUserAnchor.anchorId}`] as IamUser;

    iamUser.updatePolicyDiff({
      [s3StorageAccessOverlay.overlayId]: { action: 'delete', overlay: s3StorageAccessOverlay },
    });

    const output: ActionOutputs = {};
    output[iamUser.resourceId] = iamUser;

    return output;
  }
}

@Factory<DeleteS3StorageAccessOverlayAction>(DeleteS3StorageAccessOverlayAction)
export class DeleteS3StorageAccessOverlayActionFactory {
  static async create(): Promise<DeleteS3StorageAccessOverlayAction> {
    return new DeleteS3StorageAccessOverlayAction();
  }
}
