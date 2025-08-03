import { RegionSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsSingleAzRegionSchema extends RegionSchema {
  @Validate({
    destruct: (value: AwsSingleAzRegionSchema['awsRegionAZs']): string[] => value,
    options: { minLength: 1 },
  })
  awsRegionAZs = Schema<string[]>();

  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();
}
