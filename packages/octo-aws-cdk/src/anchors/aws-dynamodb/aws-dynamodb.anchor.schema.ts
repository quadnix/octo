import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing a DynamoDB.
 *
 * @group Anchors/AwsDynamoDB
 *
 * @hideconstructor
 */
export class AwsDynamoDBAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.TableName`: The name of the DynamoDB table.
   */
  @Validate({
    destruct: (value: AwsDynamoDBAnchorSchema['properties']): string[] => [value.TableName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    TableName: string;
  }>();
}
