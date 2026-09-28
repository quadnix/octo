import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsCloudFrontAnchorSchema } from '../../../../../anchors/aws-cloudfront/aws-cloudfront.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsCloudFrontInvalidationOverlaySchema } from './aws-cloudfront-invalidation.schema.js';

/**
 * A distribution dropping its edges' copies of a bucket's files when they change.
 *
 * @internal
 */
@Overlay('@octo', 'aws-cloudfront-invalidation-overlay', AwsCloudFrontInvalidationOverlaySchema)
export class AwsCloudFrontInvalidationOverlay extends AOverlay<
  AwsCloudFrontInvalidationOverlaySchema,
  AwsCloudFrontInvalidationOverlay
> {
  declare properties: AwsCloudFrontInvalidationOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsCloudFrontInvalidationOverlaySchema['properties'],
    anchors: [MatchingAnchor<AwsCloudFrontAnchorSchema>, MatchingAnchor<AwsS3StorageServiceAnchorSchema>],
  ) {
    super(overlayId, properties, anchors);
  }

  /**
   * The distribution and the bucket are already named in this overlay's id.
   *
   * @internal
   */
  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
