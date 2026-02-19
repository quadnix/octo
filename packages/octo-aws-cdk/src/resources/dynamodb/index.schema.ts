import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export type IDynamoDbBillingTypes = {
  PAY_PER_REQUEST: DynamoDbBillingPayPerRequestSchema;
  PROVISIONED: DynamoDbBillingProvisionedSchema;
};

export class DynamoDbBillingPayPerRequestSchema {
  @Validate({
    destruct: (value: DynamoDbBillingPayPerRequestSchema['OnDemandThroughput']): number[] => {
      return value ? [value.MaxReadRequestUnits, value.MaxWriteRequestUnits] : [];
    },
    options: { minLength: 5 },
  })
  OnDemandThroughput? = Schema<{
    MaxReadRequestUnits: number;
    MaxWriteRequestUnits: number;
  }>();

  @Validate({
    destruct: (value: DynamoDbBillingPayPerRequestSchema['WarmThroughput']): number[] => {
      return value ? [value.ReadUnitsPerSecond, value.WriteUnitsPerSecond] : [];
    },
    options: { minLength: 5 },
  })
  WarmThroughput? = Schema<{
    ReadUnitsPerSecond: number;
    WriteUnitsPerSecond: number;
  }>();
}

export class DynamoDbBillingProvisionedSchema {
  @Validate({
    destruct: (value: DynamoDbBillingProvisionedSchema['ProvisionedThroughput']): number[] => {
      return value ? [value.ReadCapacityUnits, value.WriteCapacityUnits] : [];
    },
    options: { minLength: 5 },
  })
  ProvisionedThroughput? = Schema<{
    ReadCapacityUnits: number;
    WriteCapacityUnits: number;
  }>();
}

export class DynamoDbSecondaryIndexSchema {
  @Validate({ options: { minLength: 3 } })
  IndexName = Schema<string>();

  @Validate([
    {
      // AttributeName must at least be 3 characters.
      destruct: (value: DynamoDbSecondaryIndexSchema['KeySchema']): string[] =>
        value.map((v) => [v.AttributeName]).flat(),
      options: { minLength: 3 },
    },
    {
      // KeyType must match enum.
      destruct: (value: DynamoDbSecondaryIndexSchema['KeySchema']): string[] => value.map((v) => [v.KeyType]).flat(),
      options: { regex: /^(HASH|RANGE)$/ },
    },
    {
      // Array length must at least be 1.
      options: { minLength: 1 },
    },
  ])
  KeySchema = Schema<{ AttributeName: string; KeyType: 'HASH' | 'RANGE' }[]>();

  @Validate([
    {
      // ProjectionType must match enum.
      destruct: (value: DynamoDbSecondaryIndexSchema['Projection']): string[] => [value.ProjectionType],
      options: { regex: /^(ALL|INCLUDE|KEYS_ONLY)$/ },
    },
    {
      // NonKeyAttributes must at least be 3 characters.
      destruct: (value: DynamoDbSecondaryIndexSchema['Projection']): string[] => {
        return value.NonKeyAttributes ? value.NonKeyAttributes : [];
      },
      options: { minLength: 3 },
    },
  ])
  Projection = Schema<{ ProjectionType: 'ALL' | 'INCLUDE' | 'KEYS_ONLY'; NonKeyAttributes?: string[] }>();
}

/**
 * The `DynamoDbSchema` class is the schema for the `DynamoDb` resource,
 * which represents an AWS DynamoDB table.
 * This resource can create and manage a DynamoDB table using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/).
 *
 * @group Resources/DynamoDb
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `dynamodb-<table-name>`
 */
export class DynamoDbSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.tableName` - The DynamoDB table name. **Immutable after creation.**
   * * `properties.attributeDefinitions` - Attribute definitions for key schema and index key attributes.
   *   Must include all attributes used as key attributes in `keySchema`, `localSecondaryIndexes`, and `globalSecondaryIndexes`.
   * * `properties.keySchema` - The primary key schema. **Immutable after creation.**
   *   Must contain exactly one `HASH` key and optionally one `RANGE` key.
   * * `properties.billingMode` - Billing mode: `PAY_PER_REQUEST` or `PROVISIONED`. **Mutable.**
   * * `properties.provisionedThroughput` - Required when `billingMode` is `PROVISIONED`. **Mutable.**
   * * `properties.localSecondaryIndexes` - Local secondary indexes. **Immutable after creation.**
   *   Can only be created at table creation time.
   * * `properties.globalSecondaryIndexes` - Global secondary indexes. **Mutable** (add/remove after creation).
   *   When adding a GSI, also update `attributeDefinitions` to include any new key attributes.
   * * `properties.streamSpecification` - DynamoDB Streams configuration. **Mutable.**
   *   To disable an existing stream, explicitly set `StreamEnabled: false` — do not remove the field.
   * * `properties.ttl` - Time-to-Live configuration. **Mutable.**
   *   To disable TTL, explicitly set `Enabled: false` — do not remove the field.
   */
  @Validate([
    {
      destruct: (value: DynamoDbSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
      options: { minLength: 1 },
    },
    {
      // AttributeName must at least be 3 characters.
      destruct: (value: DynamoDbSchema['properties']): string[] =>
        value.AttributeDefinitions.map((d) => d.AttributeName),
      options: { minLength: 3 },
    },
    {
      // KeyType must match enum.
      destruct: (value: DynamoDbSchema['properties']): string[] =>
        value.AttributeDefinitions.map((d) => [v.KeyType]).flat(),
      options: { regex: /^(HASH|RANGE)$/ },
    },
    {
      destruct: (value: DynamoDbSchema['properties']): string[] => [String(value.DeletionProtectionEnabled)],
      options: { regex: /^(false)$/ },
    },
    {
      destruct: (value: DynamoDbSchema['properties']): string[] => [value.TableClass],
      options: { regex: /^(STANDARD)$/ },
    },
    {
      destruct: (value: DynamoDbSchema['properties']): string[] => [value.TableName],
      options: { minLength: 5 },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    AttributeDefinitions: { AttributeName: string; AttributeType: 'B' | 'N' | 'S' }[];
    billingMode: {
      [B in keyof IDynamoDbBillingTypes]-?: IDynamoDbBillingTypes[B];
    }[keyof IDynamoDbBillingTypes];
    DeletionProtectionEnabled: false;
    KeySchema: { AttributeName: string; KeyType: 'HASH' | 'RANGE' }[];
    LocalSecondaryIndexes?: DynamoDbSecondaryIndexSchema[];
    GlobalSecondaryIndexes?: DynamoDbSecondaryIndexSchema[];
    StreamSpecification?: {
      StreamViewType: 'KEYS_ONLY' | 'NEW_AND_OLD_IMAGES' | 'NEW_IMAGE' | 'OLD_IMAGE';
    };
    TableClass: 'STANDARD';
    TableName: string;
    timeToLiveAttribute?: string;
  }>();

  /**
   * Saved response.
   * * `response.LatestStreamArn` - The ARN of the latest DynamoDB Stream.
   * * `response.TableArn` - The table ARN.
   * * `response.TableId` - The unique table ID assigned by AWS.
   */
  @Validate({
    destruct: (value: DynamoDbSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.LatestStreamArn) {
        subjects.push(value.LatestStreamArn);
      }
      if (value.TableArn) {
        subjects.push(value.TableArn);
      }
      if (value.TableId) {
        subjects.push(value.TableId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    LatestStreamArn?: string;
    TableArn?: string;
    TableId?: string;
  }>();
}
