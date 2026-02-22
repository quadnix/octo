import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export type IDynamoDBBillingTypes = {
  PAY_PER_REQUEST: DynamoDBBillingPayPerRequestSchema;
  PROVISIONED: DynamoDBBillingProvisionedSchema;
};

export class DynamoDBBillingPayPerRequestSchema {
  @Validate({
    destruct: (value: DynamoDBBillingPayPerRequestSchema['OnDemandThroughput']): number[] => {
      return value ? [value.MaxReadRequestUnits, value.MaxWriteRequestUnits] : [];
    },
    options: { minLength: 5 },
  })
  OnDemandThroughput? = Schema<{
    MaxReadRequestUnits: number;
    MaxWriteRequestUnits: number;
  }>();

  @Validate({
    destruct: (value: DynamoDBBillingPayPerRequestSchema['WarmThroughput']): number[] => {
      return value ? [value.ReadUnitsPerSecond, value.WriteUnitsPerSecond] : [];
    },
    options: { minLength: 5 },
  })
  WarmThroughput? = Schema<{
    ReadUnitsPerSecond: number;
    WriteUnitsPerSecond: number;
  }>();
}

export class DynamoDBBillingProvisionedSchema {
  @Validate({
    destruct: (value: DynamoDBBillingProvisionedSchema['ProvisionedThroughput']): number[] => {
      return value ? [value.ReadCapacityUnits, value.WriteCapacityUnits] : [];
    },
    options: { minLength: 5 },
  })
  ProvisionedThroughput? = Schema<{
    ReadCapacityUnits: number;
    WriteCapacityUnits: number;
  }>();
}

export class DynamoDBKeySchema {
  @Validate({ options: { minLength: 3 } })
  AttributeName = Schema<string>();

  @Validate({ options: { regex: /^(HASH|RANGE)$/ } })
  KeyType = Schema<'HASH' | 'RANGE'>();
}

export class DynamoDBSecondaryIndexSchema {
  @Validate({ options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ } })
  IndexName = Schema<string>();

  @Validate<unknown>([
    {
      // Array length must at least be 1.
      destruct: (value: DynamoDBSecondaryIndexSchema['KeySchema']): DynamoDBKeySchema[][] => [value],
      options: { maxLength: 2, minLength: 1 },
    },
    {
      destruct: (value: DynamoDBSecondaryIndexSchema['KeySchema']): DynamoDBKeySchema[] => value,
      options: { isSchema: { schema: DynamoDBKeySchema } },
    },
  ])
  KeySchema = Schema<DynamoDBKeySchema[]>();

  @Validate([
    {
      // ProjectionType must match enum.
      destruct: (value: DynamoDBSecondaryIndexSchema['Projection']): string[] => [value.ProjectionType],
      options: { regex: /^(ALL|INCLUDE|KEYS_ONLY)$/ },
    },
    {
      // NonKeyAttributes must at least be 3 characters.
      destruct: (value: DynamoDBSecondaryIndexSchema['Projection']): string[] => {
        return value.NonKeyAttributes ? value.NonKeyAttributes : [];
      },
      options: { minLength: 3 },
    },
  ])
  Projection = Schema<{ ProjectionType: 'ALL' | 'INCLUDE' | 'KEYS_ONLY'; NonKeyAttributes?: string[] }>();
}

/**
 * The `DynamoDBSchema` class is the schema for the `DynamoDB` resource,
 * which represents an AWS DynamoDB table.
 * This resource can create and manage a DynamoDB table using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/).
 *
 * @group Resources/DynamoDB
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `dynamodb-<table-name>`
 */
export class DynamoDBSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.AttributeDefinitions` - Attribute definitions for key schema and index key attributes.
   * * `properties.billingMode` - Billing mode: `PAY_PER_REQUEST` or `PROVISIONED`.
   * * `properties.DeletionProtectionEnabled` - Flag to enable delete protection.
   * * `properties.KeySchema` - The primary key schema with one HASH and an optional RANGE key.
   * * `properties.LocalSecondaryIndexes` - Local secondary indexes.
   * * `properties.GlobalSecondaryIndexes` - Global secondary indexes.
   * * `properties.StreamSpecification` - DynamoDB Streams configuration.
   * * `properties.TableClass` - Type of DynamoDB table.
   * * `properties.TableName` - The DynamoDB table name.
   * * `properties.timeToLiveAttribute` - Applies TTL on a number attribute.
   */
  @Validate<unknown>([
    {
      destruct: (value: DynamoDBSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
      options: { minLength: 1 },
    },
    {
      // AttributeDefinitions AttributeName must at least be 3 characters.
      destruct: (value: DynamoDBSchema['properties']): string[] =>
        value.AttributeDefinitions.map((d) => d.AttributeName),
      options: { minLength: 3 },
    },
    {
      // AttributeDefinitions AttributeType must match enum.
      destruct: (value: DynamoDBSchema['properties']): string[] =>
        value.AttributeDefinitions.map((d) => d.AttributeType),
      options: { regex: /^([BNS])$/ },
    },
    {
      // billingMode settings must match schema.
      destruct: (value: DynamoDBSchema['properties']): DynamoDBBillingPayPerRequestSchema[] => {
        return value.billingMode.type === 'PAY_PER_REQUEST' ? [value.billingMode.settings] : [];
      },
      options: { isSchema: { schema: DynamoDBBillingPayPerRequestSchema } },
    },
    {
      // billingMode settings must match schema.
      destruct: (value: DynamoDBSchema['properties']): DynamoDBBillingProvisionedSchema[] => {
        return value.billingMode.type === 'PROVISIONED' ? [value.billingMode.settings] : [];
      },
      options: { isSchema: { schema: DynamoDBBillingProvisionedSchema } },
    },
    {
      // billingMode type must match enum.
      destruct: (value: DynamoDBSchema['properties']): string[] => [value.billingMode.type],
      options: { regex: /^(PAY_PER_REQUEST|PROVISIONED)$/ },
    },
    {
      // DeletionProtectionEnabled must match enum.
      destruct: (value: DynamoDBSchema['properties']): string[] => [String(value.DeletionProtectionEnabled)],
      options: { regex: /^(false)$/ },
    },
    {
      // GlobalSecondaryIndexes must match schema.
      destruct: (value: DynamoDBSchema['properties']): DynamoDBSecondaryIndexSchema[] => value.GlobalSecondaryIndexes,
      options: { isSchema: { schema: DynamoDBSecondaryIndexSchema } },
    },
    {
      // KeySchema array must have valid length.
      destruct: (value: DynamoDBSchema['properties']): DynamoDBKeySchema[][] => [value.KeySchema],
      options: { maxLength: 2, minLength: 1 },
    },
    {
      // KeySchema must match schema.
      destruct: (value: DynamoDBSchema['properties']): DynamoDBKeySchema[] => value.KeySchema,
      options: { isSchema: { schema: DynamoDBKeySchema } },
    },
    {
      // LocalSecondaryIndexes must match schema.
      destruct: (value: DynamoDBSchema['properties']): DynamoDBSecondaryIndexSchema[] => value.LocalSecondaryIndexes,
      options: { isSchema: { schema: DynamoDBSecondaryIndexSchema } },
    },
    {
      // StreamSpecification StreamViewType must match enum.
      destruct: (value: DynamoDBSchema['properties']): string[] => {
        return value.StreamSpecification ? [value.StreamSpecification.StreamViewType] : [];
      },
      options: { regex: /^(KEYS_ONLY|NEW_AND_OLD_IMAGES|NEW_IMAGE|OLD_IMAGE)$/ },
    },
    {
      // TableClass must match enum.
      destruct: (value: DynamoDBSchema['properties']): string[] => [value.TableClass],
      options: { regex: /^(STANDARD)$/ },
    },
    {
      // TableName must at least be 3 characters.
      destruct: (value: DynamoDBSchema['properties']): string[] => [value.TableName],
      options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ },
    },
    {
      // timeToLiveAttribute must at least be 3 characters.
      destruct: (value: DynamoDBSchema['properties']): string[] => {
        return value.timeToLiveAttribute ? [value.timeToLiveAttribute] : [];
      },
      options: { minLength: 3 },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    AttributeDefinitions: { AttributeName: string; AttributeType: 'B' | 'N' | 'S' }[];
    billingMode: {
      [K in keyof IDynamoDBBillingTypes]: {
        settings: IDynamoDBBillingTypes[K];
        type: K;
      };
    }[keyof IDynamoDBBillingTypes];
    DeletionProtectionEnabled: false;
    GlobalSecondaryIndexes: DynamoDBSecondaryIndexSchema[];
    KeySchema: DynamoDBKeySchema[];
    LocalSecondaryIndexes: DynamoDBSecondaryIndexSchema[];
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
    destruct: (value: DynamoDBSchema['response']): string[] => {
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
