import { BaseAnchorSchema, type Image, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Image} model whose repositories are held in AWS ECR.
 * A module that publishes into those repositories consumes it to find the image it publishes to.
 *
 * @group Anchors/AwsEcrImage
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsEcrImageAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Image;

  /**
   * Input properties.
   * * `properties.imageId` - The name of the ECR repositories holding this image, e.g. `quadnix/nginx`.
   */
  @Validate({
    destruct: (value: AwsEcrImageAnchorSchema['properties']): string[] => [value.imageId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    imageId: string;
  }>();
}
