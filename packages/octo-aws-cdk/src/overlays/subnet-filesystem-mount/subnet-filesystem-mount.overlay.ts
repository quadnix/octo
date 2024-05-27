import { AOverlay, IOverlay, IResource, Overlay } from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { ISubnetFilesystemMountOverlayProperties } from './subnet-filesystem-mount.overlay.interface.js';

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
