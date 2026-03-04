import { Region, RegionSchema, Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

class DynamoDBGlobalReplicaSchema {
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

  @Validate({
    destruct: (value: DynamoDBGlobalReplicaSchema['tags']): string[] =>
      value ? [...Object.keys(value), ...Object.values(value)] : [],
    options: { minLength: 1 },
  })
  tags? = Schema<{ [key: string]: string }>({});
}

export class AwsDynamoDBGlobalServiceModuleSchema {
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
