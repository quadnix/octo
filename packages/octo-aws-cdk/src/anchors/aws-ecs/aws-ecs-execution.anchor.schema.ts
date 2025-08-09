import { BaseAnchorSchema, type Execution, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Execution} model representing tasks running in an AWS ECS cluster.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsExecutionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Execution;

  /**
   * Input properties.
   * * `properties.desiredCount`: The desired number of tasks.
   * * `properties.environmentVariables` - A set of environment variables to be passed to this {@link Execution}.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsEcsExecutionAnchorSchema['properties']): number[] => [value.desiredCount],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsEcsExecutionAnchorSchema['properties']): string[] => Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: AwsEcsExecutionAnchorSchema['properties']): string[] =>
        Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
  ])
  override properties = Schema<{
    desiredCount: number;
    environmentVariables: Record<string, string>;
  }>();
}
