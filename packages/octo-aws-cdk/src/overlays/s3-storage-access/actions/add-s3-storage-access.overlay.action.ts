import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import type { IamRole } from '../../../resources/iam/iam-role.resource.js';
import { S3StorageAccessOverlay } from '../s3-storage-access.overlay.js';

@Action(NodeType.OVERLAY)
export class AddS3StorageAccessOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddS3StorageAccessOverlayAction';

  collectInput(diff: Diff): string[] {
    const s3StorageAccessOverlay = diff.node as S3StorageAccessOverlay;
    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors().find((a) => a instanceof IamRoleAnchor) as IamRoleAnchor;

    return [`resource.iam-role-${iamRoleAnchor.properties.iamRoleName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3StorageAccessOverlay &&
      diff.node.NODE_NAME === 's3-storage-access-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const s3StorageAccessOverlay = diff.node as S3StorageAccessOverlay;
    const iamRoleAnchor = s3StorageAccessOverlay.getAnchors().find((a) => a instanceof IamRoleAnchor) as IamRoleAnchor;
    const iamRole = actionInputs[`resource.iam-role-${iamRoleAnchor.properties.iamRoleName}`] as IamRole;

    iamRole.updatePolicyDiff(s3StorageAccessOverlay);
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
