import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';

/**
 * `AwsServerlessEnvironmentModuleSchema` is the input schema for the `AwsServerlessEnvironmentModule`
 * module. This schema defines an environment in a serverless region, and the environment variables
 * every execution in it gets.
 *
 * @group Modules/Environment/AwsServerlessEnvironment
 *
 * @hideconstructor
 *
 * @see {@link AwsServerlessEnvironmentModule} to learn more about the `AwsServerlessEnvironmentModule` module.
 */
export class AwsServerlessEnvironmentModuleSchema {
  /**
   * The name of the environment, e.g. `qa` or `production`.
   */
  @Validate({ options: { minLength: 1 } })
  environmentName = Schema<string>();

  /**
   * Environment variables passed to every execution in this environment.
   * Keys must be valid environment variable names (alphanumeric with minimum 2 characters).
   */
  @Validate([
    {
      destruct: (value: Record<string, string>): string[] => Object.keys(value),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: Record<string, string>): string[] => Object.values(value),
      options: { regex: /^.+$/ },
    },
  ])
  environmentVariables? = Schema<Record<string, string>>({});

  /**
   * The serverless region this environment is in.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsServerlessRegionAnchorSchema }], NODE_NAME: 'region' },
      },
    },
    {
      destruct: (value: AwsServerlessEnvironmentModuleSchema['region']): [RegionSchema] => [value.synth()],
      options: {
        isSchema: { schema: RegionSchema },
      },
    },
  ])
  region = Schema<Region>();
}
