import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsEcrImageAnchorSchema } from '../../../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { AwsEcrImageTagOverlaySchema } from './aws-ecr-image-tag.schema.js';

/**
 * One version of an image, published into the repositories of the ECR image it points at.
 *
 * It is an overlay rather than a model because a published version is a fact about an image that
 * the image itself does not hold: the repository is one thing, and the versions in it are declared
 * one module at a time, each alongside the others.
 *
 * @internal
 */
@Overlay('@octo', 'aws-ecr-image-tag-overlay', AwsEcrImageTagOverlaySchema)
export class AwsEcrImageTagOverlay extends AOverlay<AwsEcrImageTagOverlaySchema, AwsEcrImageTagOverlay> {
  declare properties: AwsEcrImageTagOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsEcrImageTagOverlaySchema['properties'],
    anchors: [MatchingAnchor<AwsEcrImageAnchorSchema>],
  ) {
    super(overlayId, properties, anchors);
  }

  /**
   * The image this overlay points at is already named in its own id, so the anchor joining them
   * carries no change of its own to report.
   *
   * @internal
   */
  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
