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
  @Validate([
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
   * Saved response. For each account:region,
   * * `response.string.LatestStreamArn` - The ARN of the latest DynamoDB Stream.
   * * `response.string.TableArn` - The table ARN.
   * * `response.string.TableId` - The unique table ID assigned by AWS.
   */
  @Validate({
    destruct: (value: DynamoDBGlobalSchema['response']): string[] => {
      return value && Object.keys(value).length > 0
        ? Object.values(value).reduce<string[]>((accumulator, current) => {
            if (current.LatestStreamArn) {
              accumulator.push(current.LatestStreamArn);
            }
            if (current.TableArn) {
              accumulator.push(current.TableArn);
            }
            if (current.TableId) {
              accumulator.push(current.TableId);
            }
            return accumulator;
          }, [])
        : [];
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    [key: string]: {
      LatestStreamArn?: string;
      TableArn?: string;
      TableId?: string;
    };
  }>();
}
