import { AOverlay, type Diff, MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsIamRoleAnchor } from '../../../../../anchors/aws-iam/aws-iam-role.anchor.js';
import type { AwsS3StorageServiceDirectoryAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-directory.anchor.schema.js';
import { AwsEcsServerS3AccessOverlaySchema } from './aws-ecs-server-s3-access.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'aws-ecs-server-s3-access-overlay', AwsEcsServerS3AccessOverlaySchema)
export class AwsEcsServerS3AccessOverlay extends AOverlay<
  AwsEcsServerS3AccessOverlaySchema,
  AwsEcsServerS3AccessOverlay
> {
  declare anchors: [AwsIamRoleAnchor, MatchingAnchor<AwsS3StorageServiceDirectoryAnchorSchema>];
  declare properties: AwsEcsServerS3AccessOverlaySchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsEcsServerS3AccessOverlaySchema['properties'],
    anchors: [AwsIamRoleAnchor, MatchingAnchor<AwsS3StorageServiceDirectoryAnchorSchema>],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
