import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  type Diff,
  DiffAction,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import { S3DirectoryAnchor } from '../../../anchors/s3-directory.anchor.js';
import type { IamRole } from '../../../resources/iam-role/index.js';
import { S3StorageAccessOverlay } from '../s3-storage-access.overlay.js';

@Action(S3StorageAccessOverlay)
export class AddS3StorageAccessOverlayAction implements IModelAction {
  collectInput(diff: Diff): string[] {
    const s3StorageAccessOverlay = diff.node as S3StorageAccessOverlay;

    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors([], [IamRoleAnchor])[0] as IamRoleAnchor;
    const iamRoleName = iamRoleAnchor.properties.iamRoleName;

    return [`resource.iam-role-${iamRoleName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3StorageAccessOverlay &&
      (diff.node.constructor as typeof S3StorageAccessOverlay).NODE_NAME === 's3-storage-access-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const s3StorageAccessOverlay = diff.node as S3StorageAccessOverlay;

    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors([], [IamRoleAnchor])[0] as IamRoleAnchor;
    const iamRoleName = iamRoleAnchor.properties.iamRoleName;

    const s3DirectoryAnchor = s3StorageAccessOverlay.getAnchors([], [S3DirectoryAnchor])[0] as S3DirectoryAnchor;

    const iamRole = actionInputs[`resource.iam-role-${iamRoleName}`] as IamRole;

    iamRole.addS3BucketPolicy(
      s3StorageAccessOverlay.properties.iamRolePolicyName,
      s3DirectoryAnchor.properties.bucketName,
      s3DirectoryAnchor.properties.remoteDirectoryPath,
      {
        allowRead: s3DirectoryAnchor.properties.allowRead,
        allowWrite: s3DirectoryAnchor.properties.allowWrite,
      },
    );
    actionOutputs[iamRole.resourceId] = iamRole;

    return actionOutputs;
  }
}

@Factory<AddS3StorageAccessOverlayAction>(AddS3StorageAccessOverlayAction)
export class AddS3StorageAccessOverlayActionFactory {
  static async create(): Promise<AddS3StorageAccessOverlayAction> {
    return new AddS3StorageAccessOverlayAction();
  }
}
