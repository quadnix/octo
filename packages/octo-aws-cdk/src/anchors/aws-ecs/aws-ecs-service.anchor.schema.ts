import { type AOverlay, BaseAnchorSchema, type BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link AOverlay} overlay representing an AWS ECS service.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsEcsServiceAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: AOverlay<BaseOverlaySchema, any>;

  /**
   * Input properties.
   * * `properties.executionId`: The executionId associated with this overlay.
   */
  @Validate({
    destruct: (value: AwsEcsServiceAnchorSchema['properties']): string[] => [value.executionId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    executionId: string;
  }>();
}
