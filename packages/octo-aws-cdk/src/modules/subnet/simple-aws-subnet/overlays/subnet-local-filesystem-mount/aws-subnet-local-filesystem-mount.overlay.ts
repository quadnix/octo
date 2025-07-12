import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { EfsFilesystemAnchorSchema } from '../../../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import type { SubnetLocalFilesystemMountAnchor } from '../../../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.js';
import { AwsSubnetLocalFilesystemMountSchema } from './aws-subnet-local-filesystem-mount.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'subnet-local-filesystem-mount-overlay', AwsSubnetLocalFilesystemMountSchema)
export class AwsSubnetLocalFilesystemMountOverlay extends AOverlay<
  AwsSubnetLocalFilesystemMountSchema,
  AwsSubnetLocalFilesystemMountOverlay
> {
  declare properties: AwsSubnetLocalFilesystemMountSchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsSubnetLocalFilesystemMountSchema['properties'],
    anchors: [MatchingAnchor<EfsFilesystemAnchorSchema>, SubnetLocalFilesystemMountAnchor],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
