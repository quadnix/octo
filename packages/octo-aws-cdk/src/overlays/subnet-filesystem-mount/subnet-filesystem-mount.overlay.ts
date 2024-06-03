import { AOverlay, Overlay } from '@quadnix/octo';
import type { IOverlay, IResource } from '@quadnix/octo';
import type { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import type { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import type { ISubnetFilesystemMountOverlayProperties } from './subnet-filesystem-mount.overlay.interface.js';

@Overlay()
export class SubnetFilesystemMountOverlay extends AOverlay<SubnetFilesystemMountOverlay> {
  override readonly MODEL_NAME: string = 'subnet-filesystem-mount-overlay';

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: ISubnetFilesystemMountOverlayProperties,
    anchors: [RegionFilesystemAnchor, SubnetFilesystemMountAnchor],
  ) {
    super(overlayId, properties as unknown as IResource['properties'], anchors);
  }
}
