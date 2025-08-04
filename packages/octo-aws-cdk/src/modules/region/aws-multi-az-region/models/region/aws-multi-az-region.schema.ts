import { RegionSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsMultiAzRegionSchema extends RegionSchema {
  @Validate({
    destruct: (value: AwsMultiAzRegionSchema['awsRegionAZs']): string[] => value,
    options: { minLength: 1 },
  })
  awsRegionAZs = Schema<string[]>();

  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();
}
