import { AOverlay, Diff, type IOverlay, Overlay } from '@quadnix/octo';
import type { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import type { S3DirectoryAnchor } from '../../anchors/s3-directory.anchor.js';
import type { IS3StorageAccessOverlayProperties } from './s3-storage-access.overlay.interface.js';

@Overlay('@octo', 's3-storage-access-overlay')
export class S3StorageAccessOverlay extends AOverlay<S3StorageAccessOverlay> {
  declare properties: IS3StorageAccessOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: IS3StorageAccessOverlayProperties,
    anchors: [IamRoleAnchor, S3DirectoryAnchor],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
