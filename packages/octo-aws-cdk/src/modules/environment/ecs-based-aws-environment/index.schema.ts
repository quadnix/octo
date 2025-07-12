import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * `AwsEnvironmentModuleSchema` is the input schema for the `AwsEnvironmentModule` module.
 * This schema defines the required and optional inputs for creating ECS-based environments,
 * including environment naming, variables, and region association.
 *
 * @group Modules/Environment/EcsBasedAwsEnvironment
 *
 * @hideconstructor
 *
 * @see {@link AwsEnvironmentModule} to learn more about the `AwsEnvironmentModule` module.
 */
export class AwsEnvironmentModuleSchema {
  /**
   * The name of the environment (e.g., 'development', 'staging', 'production').
   * This name is used to identify the environment and forms part of the ECS cluster name.
   */
  @Validate({ options: { minLength: 1 } })
  environmentName = Schema<string>();

  /**
   * A collection of environment variables to be set for the environment.
   * These variables are available to all services and deployments within the environment.
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
   * The AWS region where this environment will be created.
   * The region must have AWS region anchors configured.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();
}
