import { RegionSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsServerlessRegionSchema extends RegionSchema {
  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();
}
