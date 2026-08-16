import { BaseAnchorSchema, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Server} model representing an AWS IAM role.
 *
 * @group Anchors/AwsIam
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsIamRoleAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Server;

  /**
   * Input properties.
   * * `properties.iamRoleName`: The name of the IAM role.
   */
  @Validate({
    destruct: (value: AwsIamRoleAnchorSchema['properties']): string[] => [value.iamRoleName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    iamRoleName: string;
  }>();
}
