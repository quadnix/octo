import { Region, RegionSchema, Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * `DynamoDBGlobalReplicaSchema` is one replica of a global DynamoDB table.
 *
 * @group Modules/Service/AwsDynamoDBGlobalService
 *
 * @hideconstructor
 */
class DynamoDBGlobalReplicaSchema {
  /**
   * The region this replica lives in. It cannot be the region the table sits in. Regions in one AWS
   * region share one replica, and a region in the table's own AWS region gets none.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      },
    },
    {
      destruct: (value: DynamoDBGlobalReplicaSchema['region']): [RegionSchema] => [value.synth()],
      options: { isSchema: { schema: RegionSchema } },
    },
  ])
  region = Schema<Region>();

  /**
   * Tags to apply to this replica. Replicas in one AWS region must have the same tags.
   */
  @Validate({
    destruct: (value: DynamoDBGlobalReplicaSchema['tags']): string[] =>
      value ? [...Object.keys(value), ...Object.values(value)] : [],
    options: { minLength: 1 },
  })
  tags? = Schema<{ [key: string]: string }>({});
}

/**
 * `AwsDynamoDBGlobalServiceModuleSchema` is the input schema for the `AwsDynamoDBGlobalServiceModule` module.
 * This schema defines the table being replicated, and the regions it is replicated into.
 *
 * @group Modules/Service/AwsDynamoDBGlobalService
 *
 * @hideconstructor
 *
 * @see {@link AwsDynamoDBGlobalServiceModule} to learn more about the module.
 */
export class AwsDynamoDBGlobalServiceModuleSchema {
  /**
   * The DynamoDB service to replicate, as produced by the `AwsDynamoDBServiceModule` module.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsDynamoDBAnchorSchema }], NODE_NAME: 'service' },
      },
    },
    {
      destruct: (value: AwsDynamoDBGlobalServiceModuleSchema['dynamoDBService']): [ServiceSchema] => [value.synth()],
      options: { isSchema: { schema: ServiceSchema } },
    },
  ])
  dynamoDBService = Schema<Service>();

  /**
   * The regions to replicate the table into. At least one is required.
   */
  @Validate<unknown>([
    {
      // At least 1 replica is required.
      destruct: (value: AwsDynamoDBGlobalServiceModuleSchema['replicas']): DynamoDBGlobalReplicaSchema[][] => [value],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsDynamoDBGlobalServiceModuleSchema['replicas']): DynamoDBGlobalReplicaSchema[] => value,
      options: { isSchema: { schema: DynamoDBGlobalReplicaSchema } },
    },
  ])
  replicas = Schema<DynamoDBGlobalReplicaSchema[]>();
}
