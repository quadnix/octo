import { BaseAnchorSchema, type Environment, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Environment} model representing an AWS ECS cluster.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsClusterAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Environment;

  /**
   * Input properties.
   * * `properties.clusterName`: The name of the ECS cluster.
   * * `properties.environmentVariables`: A set of environment variables to be passed
   * to any execution running in this environment.
   */
  @Validate([
    {
      destruct: (value: AwsEcsClusterAnchorSchema['properties']): string[] => [value.clusterName],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsEcsClusterAnchorSchema['properties']): string[] => Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: AwsEcsClusterAnchorSchema['properties']): string[] => Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
  ])
  override properties = Schema<{
    clusterName: string;
    environmentVariables: Record<string, string>;
  }>();
}
