import { AOverlay, type IOverlay, Overlay } from '@quadnix/octo';
import type { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import type { IRegionFilesystemOverlayProperties } from './region-filesystem.overlay.interface.js';

@Overlay()
export class RegionFilesystemOverlay extends AOverlay<RegionFilesystemOverlay> {
  override readonly NODE_NAME: string = 'region-filesystem-overlay';

  declare properties: IRegionFilesystemOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: IRegionFilesystemOverlayProperties,
    anchors: [RegionFilesystemAnchor],
  ) {
    super(overlayId, properties, anchors);
  }
}
