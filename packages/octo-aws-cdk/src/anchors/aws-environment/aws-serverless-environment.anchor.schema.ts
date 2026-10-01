import { BaseAnchorSchema, type Environment, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Environment} model in an AWS serverless region.
 * The environment creates nothing; it carries the environment variables every execution in it gets.
 *
 * @group Anchors/AwsServerlessEnvironment
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsServerlessEnvironmentAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Environment;

  /**
   * Input properties.
   * * `properties.environmentName` - The name of the environment.
   * * `properties.environmentVariables` - The environment variables passed to every execution in this
   * environment.
   * * `properties.serverless` - Always `true`. It sets this anchor apart from any other environment
   * anchor, so an environment with a cluster never matches this schema.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsServerlessEnvironmentAnchorSchema['properties']): string[] => [value.environmentName],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsServerlessEnvironmentAnchorSchema['properties']): string[] =>
        Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: AwsServerlessEnvironmentAnchorSchema['properties']): string[] =>
        Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
    {
      options: {
        custom: (value: AwsServerlessEnvironmentAnchorSchema['properties']): boolean => value.serverless === true,
      },
    },
  ])
  override properties = Schema<{
    environmentName: string;
    environmentVariables: Record<string, string>;
    serverless: boolean;
  }>();
}
