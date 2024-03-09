import { AAnchor, AOverlay, IOverlay, IResource, Overlay } from '@quadnix/octo';
import { IS3StorageAccessOverlayProperties } from './s3-storage-access.overlay.interface.js';

@Overlay()
export class S3StorageAccessOverlay extends AOverlay<S3StorageAccessOverlay> {
  override readonly MODEL_NAME: string = 's3-storage-access';

  constructor(overlayId: IOverlay['overlayId'], properties: IS3StorageAccessOverlayProperties, anchors: AAnchor[]) {
    super(overlayId, properties as unknown as IResource['properties'], anchors);
  }
}
