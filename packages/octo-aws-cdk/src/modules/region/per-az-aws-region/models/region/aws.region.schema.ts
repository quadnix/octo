import { RegionSchema, Schema, Validate } from '@quadnix/octo';

export class AwsRegionSchema extends RegionSchema {
  @Validate({ destruct: (value: AwsRegionSchema['awsRegionAZs']): string[] => value, options: { minLength: 1 } })
  awsRegionAZs = Schema<string[]>();

  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();
}
