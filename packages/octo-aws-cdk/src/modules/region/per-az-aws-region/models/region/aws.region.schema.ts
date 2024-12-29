import { RegionSchema, Schema } from '@quadnix/octo';

export class AwsRegionSchema extends RegionSchema {
  awsRegionAZs = Schema<string[]>();

  awsRegionId = Schema<string>();
}
