import { AOverlay, IOverlay, IResource, Overlay } from '@quadnix/octo';
import { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import { S3DirectoryAnchor } from '../../anchors/s3-directory.anchor.js';
import { IS3StorageAccessOverlayProperties } from './s3-storage-access.overlay.interface.js';

@Overlay()
export class S3StorageAccessOverlay extends AOverlay<S3StorageAccessOverlay> {
  override readonly MODEL_NAME: string = 's3-storage-access-overlay';

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: IS3StorageAccessOverlayProperties,
    anchors: [IamRoleAnchor, S3DirectoryAnchor],
  ) {
    super(overlayId, properties as unknown as IResource['properties'], anchors);
  }
}
