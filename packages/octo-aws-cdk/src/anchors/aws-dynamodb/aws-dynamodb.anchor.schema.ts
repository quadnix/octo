import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing a DynamoDB.
 *
 * @group Anchors/AwsDynamoDB
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsDynamoDBAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.awsAccountId`: The AWS account the table is created in.
   * * `properties.TableName`: The name of the DynamoDB table.
   */
  @Validate({
    destruct: (value: AwsDynamoDBAnchorSchema['properties']): string[] => [value.awsAccountId, value.TableName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    TableName: string;
  }>();
}
