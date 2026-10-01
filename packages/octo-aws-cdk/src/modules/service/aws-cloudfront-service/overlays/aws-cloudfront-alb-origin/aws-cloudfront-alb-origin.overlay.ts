import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsCloudFrontAnchor } from '../../../../../anchors/aws-cloudfront/aws-cloudfront.anchor.js';
import type { AwsEcsAlbAnchorSchema } from '../../../../../anchors/aws-ecs/aws-ecs-alb.anchor.schema.js';
import { AwsCloudFrontAlbOriginOverlaySchema } from './aws-cloudfront-alb-origin.schema.js';

/**
 * An ALB served by a distribution, through the ALB's DNS name.
 *
 * @internal
 */
@Overlay('@octo', 'aws-cloudfront-alb-origin-overlay', AwsCloudFrontAlbOriginOverlaySchema)
export class AwsCloudFrontAlbOriginOverlay extends AOverlay<
  AwsCloudFrontAlbOriginOverlaySchema,
  AwsCloudFrontAlbOriginOverlay
> {
  declare properties: AwsCloudFrontAlbOriginOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsCloudFrontAlbOriginOverlaySchema['properties'],
    anchors: [AwsCloudFrontAnchor, MatchingAnchor<AwsEcsAlbAnchorSchema>],
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
