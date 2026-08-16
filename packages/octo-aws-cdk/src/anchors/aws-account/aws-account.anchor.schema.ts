import { type Account, BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Account} model representing an AWS account.
 *
 * @group Anchors/AwsAccount
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsAccountAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Account;

  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account ID.
   */
  @Validate({
    destruct: (value: AwsAccountAnchorSchema['properties']): string[] => [value.awsAccountId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
  }>();
}
