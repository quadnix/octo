import { RegionSchema, Schema } from '@quadnix/octo';

export class AwsRegionSchema extends RegionSchema {
  awsRegionAZ = Schema<string>();

  awsRegionId = Schema<string>();
}
