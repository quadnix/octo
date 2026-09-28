import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsCloudFrontAnchor } from '../../../../../anchors/aws-cloudfront/aws-cloudfront.anchor.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsCloudFrontOriginOverlaySchema } from './aws-cloudfront-origin.schema.js';

/**
 * A source served by a distribution.
 *
 * @internal
 */
@Overlay('@octo', 'aws-cloudfront-origin-overlay', AwsCloudFrontOriginOverlaySchema)
export class AwsCloudFrontOriginOverlay extends AOverlay<AwsCloudFrontOriginOverlaySchema, AwsCloudFrontOriginOverlay> {
  declare properties: AwsCloudFrontOriginOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsCloudFrontOriginOverlaySchema['properties'],
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
