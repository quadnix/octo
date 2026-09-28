import { Schema, ServiceSchema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsCloudFrontServiceSchema extends ServiceSchema {
  @Validate({ options: { minLength: 1 } })
  distributionName = Schema<string>();
}
