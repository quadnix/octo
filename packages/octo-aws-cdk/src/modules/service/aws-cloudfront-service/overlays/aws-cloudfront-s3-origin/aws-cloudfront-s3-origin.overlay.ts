import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsCloudFrontAnchor } from '../../../../../anchors/aws-cloudfront/aws-cloudfront.anchor.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsCloudFrontS3OriginOverlaySchema } from './aws-cloudfront-s3-origin.schema.js';

/**
 * An S3 bucket served by a distribution, through origin access control.
 *
 * @internal
 */
@Overlay('@octo', 'aws-cloudfront-s3-origin-overlay', AwsCloudFrontS3OriginOverlaySchema)
export class AwsCloudFrontS3OriginOverlay extends AOverlay<
  AwsCloudFrontS3OriginOverlaySchema,
  AwsCloudFrontS3OriginOverlay
> {
  declare properties: AwsCloudFrontS3OriginOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsCloudFrontS3OriginOverlaySchema['properties'],
    anchors: [AwsCloudFrontAnchor, MatchingAnchor<AwsS3StorageServiceAnchorSchema>],
  ) {
    super(overlayId, properties, anchors);
  }

  /**
   * @internal
   */
  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
