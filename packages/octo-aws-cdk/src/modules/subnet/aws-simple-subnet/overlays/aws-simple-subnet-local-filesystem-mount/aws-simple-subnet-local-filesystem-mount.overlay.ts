import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsEfsAnchorSchema } from '../../../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsSubnetLocalFilesystemMountAnchor } from '../../../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.js';
import { AwsSimpleSubnetLocalFilesystemMountOverlaySchema } from './aws-simple-subnet-local-filesystem-mount.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'aws-simple-subnet-local-filesystem-mount-overlay', AwsSimpleSubnetLocalFilesystemMountOverlaySchema)
export class AwsSimpleSubnetLocalFilesystemMountOverlay extends AOverlay<
  AwsSimpleSubnetLocalFilesystemMountOverlaySchema,
  AwsSimpleSubnetLocalFilesystemMountOverlay
> {
  declare properties: AwsSimpleSubnetLocalFilesystemMountOverlaySchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsSimpleSubnetLocalFilesystemMountOverlaySchema['properties'],
    anchors: [MatchingAnchor<AwsEfsAnchorSchema>, AwsSubnetLocalFilesystemMountAnchor],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
