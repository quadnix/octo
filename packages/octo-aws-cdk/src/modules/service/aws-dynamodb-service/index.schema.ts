import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import {
  DynamoDBBillingPayPerRequestSchema,
  DynamoDBBillingProvisionedSchema,
  DynamoDBKeySchema,
  DynamoDBSecondaryIndexSchema,
  type IDynamoDBBillingTypes,
} from '../../../resources/dynamodb/index.schema.js';

/**
 * `AwsDynamoDBServiceModuleSchema` is the input schema for the `AwsDynamoDBServiceModule` module.
 * This schema defines the comprehensive configuration for DynamoDB.
 *
 * @group Modules/Service/AwsDynamoDBService
 *
 * @hideconstructor
 *
 * @see {@link AwsDynamoDBServiceModule} to learn more about the module.
 */
export class AwsDynamoDBServiceModuleSchema {
  /**
   * Attribute definitions for every attribute referenced in `KeySchema`, `LocalSecondaryIndexes`,
   * or `GlobalSecondaryIndexes`. Each entry maps an attribute name to its scalar type.
   */
  @Validate([
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['AttributeDefinitions']): string[] =>
        value.map((d) => d.AttributeName),
      options: { minLength: 3 },
    },
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['AttributeDefinitions']): string[] =>
        value.map((d) => d.AttributeType),
      options: { regex: /^([BNS])$/ },
    },
  ])
  AttributeDefinitions = Schema<{ AttributeName: string; AttributeType: 'B' | 'N' | 'S' }[]>();

  /**
   * Billing mode for the table.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['billingMode']): DynamoDBBillingPayPerRequestSchema[] => {
        return value.type === 'PAY_PER_REQUEST' ? [value.settings] : [];
      },
      options: { isSchema: { schema: DynamoDBBillingPayPerRequestSchema } },
    },
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['billingMode']): DynamoDBBillingProvisionedSchema[] => {
        return value.type === 'PROVISIONED' ? [value.settings] : [];
      },
      options: { isSchema: { schema: DynamoDBBillingProvisionedSchema } },
    },
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['billingMode']): string[] => [value.type],
      options: { regex: /^(PAY_PER_REQUEST|PROVISIONED)$/ },
    },
  ])
  billingMode = Schema<
    {
      [K in keyof IDynamoDBBillingTypes]: {
        settings: IDynamoDBBillingTypes[K];
        type: K;
      };
    }[keyof IDynamoDBBillingTypes]
  >();

  /**
   * Global Secondary Indexes to create on the table.
   * Requires `StreamSpecification` to be set.
   */
  @Validate({
    destruct: (value: AwsDynamoDBServiceModuleSchema['GlobalSecondaryIndexes']): DynamoDBSecondaryIndexSchema[] =>
      value || [],
    options: { isSchema: { schema: DynamoDBSecondaryIndexSchema } },
  })
  GlobalSecondaryIndexes? = Schema<DynamoDBSecondaryIndexSchema[]>([]);

  /**
   * Primary key schema: exactly one `HASH` key and an optional `RANGE` key.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['KeySchema']): DynamoDBKeySchema[][] => [value],
      options: { maxLength: 2, minLength: 1 },
    },
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['KeySchema']): string[] => value.map((k) => k.KeyType),
      options: { regex: /^(HASH|RANGE)$/ },
    },
  ])
  KeySchema = Schema<DynamoDBKeySchema[]>();

  /**
   * Local Secondary Indexes to create on the table.
   * LSIs are immutable after table creation.
   */
  @Validate({
    destruct: (value: AwsDynamoDBServiceModuleSchema['LocalSecondaryIndexes']): DynamoDBSecondaryIndexSchema[] =>
      value || [],
    options: { isSchema: { schema: DynamoDBSecondaryIndexSchema } },
  })
  LocalSecondaryIndexes? = Schema<DynamoDBSecondaryIndexSchema[]>([]);

  /**
   * The AWS region where the DynamoDB table will be created.
   * The region must have AWS region anchors configured.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      },
    },
    {
      destruct: (value: AwsDynamoDBServiceModuleSchema['region']): [RegionSchema] => [value.synth()],
      options: { isSchema: { schema: RegionSchema } },
    },
  ])
  region = Schema<Region>();

  /**
   * Enables DynamoDB Streams with the specified view type.
   * Required when `GlobalSecondaryIndexes` are defined.
   */
  @Validate({
    destruct: (value: AwsDynamoDBServiceModuleSchema['StreamSpecification']): string[] =>
      value ? [value.StreamViewType] : [],
    options: { regex: /^(KEYS_ONLY|NEW_AND_OLD_IMAGES|NEW_IMAGE|OLD_IMAGE)$/ },
  })
  StreamSpecification? = Schema<{
    StreamViewType: 'KEYS_ONLY' | 'NEW_AND_OLD_IMAGES' | 'NEW_IMAGE' | 'OLD_IMAGE';
  } | null>(null);

  /**
   * The DynamoDB table name..
   */
  @Validate({ options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ } })
  TableName = Schema<string>();

  /**
   * The attribute name to use for TTL expiry (must store Unix epoch timestamp in seconds).
   */
  @Validate({
    destruct: (value: AwsDynamoDBServiceModuleSchema['timeToLiveAttribute']): string[] => (value ? [value] : []),
    options: { minLength: 3 },
  })
  timeToLiveAttribute? = Schema<string | null>(null);
}
