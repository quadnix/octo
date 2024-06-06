import { AOverlay, type IOverlay, type IResource, Overlay } from '@quadnix/octo';
import type { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import type { IRegionFilesystemOverlayProperties } from './region-filesystem.overlay.interface.js';

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
