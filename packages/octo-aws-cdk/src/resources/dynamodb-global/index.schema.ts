import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class DynamoDBGlobalReplicaSchema {
  @Validate({ options: { minLength: 1 } })
  awsAccountId = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();

  @Validate({
    destruct: (value: DynamoDBGlobalReplicaSchema['tags']): string[] =>
      value ? [...Object.keys(value), ...Object.values(value)] : [],
    options: { minLength: 1 },
  })
  tags? = Schema<{ [key: string]: string }>({});
}

/**
 * The `DynamoDBGlobalSchema` class is the schema for the `DynamoDBGlobal` resource,
 * which represents an AWS DynamoDB global table.
 * This resource can manage a set of DynamoDB tables replicated globally using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/).
 *
 * @group Resources/DynamoDB
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   dynamodb((DynamoDB)) --> dynamodb_global((DynamoDB<br>Global))
 * ```
 * @overrideProperty resourceId - The resource id is of format `dynamodb-global-<table-name>`
 */
export class DynamoDBGlobalSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.replicas` - List of replicas for the DynamoDB table.
   */
  @Validate<unknown>([
    {
      // At least 1 replica is required.
      destruct: (value: DynamoDBGlobalSchema['properties']): DynamoDBGlobalReplicaSchema[][] => [value.replicas],
      options: { minLength: 1 },
    },
    {
      // replicas must match DynamoDBGlobalReplicaSchema schema.
      destruct: (value: DynamoDBGlobalSchema['properties']): DynamoDBGlobalReplicaSchema[] => value.replicas,
      options: { isSchema: { schema: DynamoDBGlobalReplicaSchema } },
    },
  ])
  override properties = Schema<{
    replicas: DynamoDBGlobalReplicaSchema[];
  }>();

  /**
   * Saved response. Flat map keyed by `<accountId>:<regionId>:<field>`.
   * * `response["<accountId>:<regionId>:TableArn"]` - The table ARN for that replica.
   */
  @Validate({
    destruct: (value: DynamoDBGlobalSchema['response']): string[] => {
      return value ? Object.values(value).filter(Boolean) : [];
    },
    options: { minLength: 1 },
  })
  override response = Schema<{ [key: string]: string }>();
}
