import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsDeploymentAnchor } from '../../../../../anchors/aws-deployment/aws-deployment.anchor.js';
import type { AwsEcrImageAnchorSchema } from '../../../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { AwsDeploymentImageOverlaySchema } from './aws-deployment-image.schema.js';

/**
 * Links a deployment to the ECR image whose published tag it runs. It creates nothing: the execution
 * running the deployment follows it to the published tag, and names that tag's image.
 *
 * @internal
 */
@Overlay('@octo', 'aws-deployment-image-overlay', AwsDeploymentImageOverlaySchema)
export class AwsDeploymentImageOverlay extends AOverlay<AwsDeploymentImageOverlaySchema, AwsDeploymentImageOverlay> {
  declare anchors: [AwsDeploymentAnchor, MatchingAnchor<AwsEcrImageAnchorSchema>];
  declare properties: AwsDeploymentImageOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsDeploymentImageOverlaySchema['properties'],
    anchors: [AwsDeploymentAnchor, MatchingAnchor<AwsEcrImageAnchorSchema>],
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
