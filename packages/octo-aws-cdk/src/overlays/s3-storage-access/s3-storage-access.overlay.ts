import { AOverlay, type IOverlay, Overlay } from '@quadnix/octo';
import type { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import type { S3DirectoryAnchor } from '../../anchors/s3-directory.anchor.js';
import type { IS3StorageAccessOverlayProperties } from './s3-storage-access.overlay.interface.js';

@Overlay()
export class S3StorageAccessOverlay extends AOverlay<S3StorageAccessOverlay> {
  override readonly MODEL_NAME: string = 's3-storage-access-overlay';

  declare properties: IS3StorageAccessOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: IS3StorageAccessOverlayProperties,
    anchors: [IamRoleAnchor, S3DirectoryAnchor],
  ) {
    super(overlayId, properties, anchors);
  }
}
