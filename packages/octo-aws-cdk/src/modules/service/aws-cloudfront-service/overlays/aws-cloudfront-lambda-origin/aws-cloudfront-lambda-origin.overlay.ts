import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsCloudFrontAnchor } from '../../../../../anchors/aws-cloudfront/aws-cloudfront.anchor.js';
import type { AwsLambdaFunctionAnchorSchema } from '../../../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import { AwsCloudFrontLambdaOriginOverlaySchema } from './aws-cloudfront-lambda-origin.schema.js';

/**
 * A Lambda function served by a distribution, through the function's URL.
 *
 * @internal
 */
@Overlay('@octo', 'aws-cloudfront-lambda-origin-overlay', AwsCloudFrontLambdaOriginOverlaySchema)
export class AwsCloudFrontLambdaOriginOverlay extends AOverlay<
  AwsCloudFrontLambdaOriginOverlaySchema,
  AwsCloudFrontLambdaOriginOverlay
> {
  declare properties: AwsCloudFrontLambdaOriginOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsCloudFrontLambdaOriginOverlaySchema['properties'],
    anchors: [AwsCloudFrontAnchor, MatchingAnchor<AwsLambdaFunctionAnchorSchema>],
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
