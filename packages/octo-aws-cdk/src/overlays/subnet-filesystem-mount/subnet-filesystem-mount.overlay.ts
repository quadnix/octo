import { AOverlay, type Diff, type IOverlay, Overlay } from '@quadnix/octo';
import type { FilesystemAnchor } from '../../anchors/filesystem.anchor.js';
import type { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import type { ISubnetFilesystemMountOverlayProperties } from './subnet-filesystem-mount.overlay.interface.js';

@Overlay('@octo', 'subnet-filesystem-mount-overlay')
export class SubnetFilesystemMountOverlay extends AOverlay<SubnetFilesystemMountOverlay> {
  declare properties: ISubnetFilesystemMountOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: ISubnetFilesystemMountOverlayProperties,
    anchors: [FilesystemAnchor, SubnetFilesystemMountAnchor],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
