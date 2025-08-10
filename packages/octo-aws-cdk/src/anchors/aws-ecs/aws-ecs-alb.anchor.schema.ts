import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing an AWS ALB.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsAlbAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.albName`: The name of the ALB.
   */
  @Validate({
    destruct: (value: AwsEcsAlbAnchorSchema['properties']): string[] => [value.albName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    albName: string;
  }>();
}
