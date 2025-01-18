import { AOverlay, type Diff, Overlay } from '@quadnix/octo';
import type { AwsFilesystemAnchor } from '../../anchors/aws-filesystem.anchor.js';
import type { AwsSubnetLocalFilesystemMountAnchor } from '../../anchors/aws-subnet-local-filesystem-mount.anchor.js';
import { AwsSubnetLocalFilesystemMountSchema } from './aws-subnet-local-filesystem-mount.schema.js';

@Overlay('@octo', 'subnet-local-filesystem-mount-overlay', AwsSubnetLocalFilesystemMountSchema)
export class AwsSubnetLocalFilesystemMountOverlay extends AOverlay<
  AwsSubnetLocalFilesystemMountSchema,
  AwsSubnetLocalFilesystemMountOverlay
> {
  declare properties: AwsSubnetLocalFilesystemMountSchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsSubnetLocalFilesystemMountSchema['properties'],
    anchors: [AwsFilesystemAnchor, AwsSubnetLocalFilesystemMountAnchor],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
