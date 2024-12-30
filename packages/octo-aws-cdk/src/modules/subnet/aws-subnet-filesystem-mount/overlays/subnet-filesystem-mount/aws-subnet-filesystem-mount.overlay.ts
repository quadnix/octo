import { AOverlay, type Diff, Overlay } from '@quadnix/octo';
import type { AwsFilesystemAnchor } from '../../anchors/aws-filesystem.anchor.js';
import type { AwsSubnetFilesystemMountAnchor } from '../../anchors/aws-subnet-filesystem-mount.anchor.js';
import { AwsSubnetFilesystemMountSchema } from './aws-subnet-filesystem-mount.schema.js';

@Overlay('@octo', 'subnet-filesystem-mount-overlay', AwsSubnetFilesystemMountSchema)
export class AwsSubnetFilesystemMountOverlay extends AOverlay<
  AwsSubnetFilesystemMountSchema,
  AwsSubnetFilesystemMountOverlay
> {
  declare properties: AwsSubnetFilesystemMountSchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsSubnetFilesystemMountSchema['properties'],
    anchors: [AwsFilesystemAnchor, AwsSubnetFilesystemMountAnchor],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
