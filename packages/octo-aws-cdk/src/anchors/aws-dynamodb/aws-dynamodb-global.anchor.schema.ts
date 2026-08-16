import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing a global DynamoDB.
 *
 * @group Anchors/AwsDynamoDB
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsDynamoDBGlobalAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.TableName`: The name of the global DynamoDB table.
   */
  @Validate({
    destruct: (value: AwsDynamoDBGlobalAnchorSchema['properties']): string[] => [value.TableName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    TableName: string;
  }>();
}
