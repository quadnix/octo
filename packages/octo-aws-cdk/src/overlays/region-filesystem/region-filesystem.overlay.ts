import { AOverlay, IOverlay, IResource, Overlay } from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import { IRegionFilesystemOverlayProperties } from './region-filesystem.overlay.interface.js';

@Overlay()
export class RegionFilesystemOverlay extends AOverlay<RegionFilesystemOverlay> {
  override readonly MODEL_NAME: string = 'region-filesystem-overlay';

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: IRegionFilesystemOverlayProperties,
    anchors: [RegionFilesystemAnchor],
  ) {
    super(overlayId, properties as unknown as IResource['properties'], anchors);
  }
}
