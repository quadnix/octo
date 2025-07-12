import { BaseAnchorSchema, type Execution, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Execution} model representing tasks running in an AWS ECS cluster.
 *
 * @group Anchors/EcsExecution
 *
 * @hideconstructor
 */
export class EcsExecutionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Execution;

  /**
   * Input properties.
   * * `properties.environmentVariables` - A set of environment variables to be passed to this {@link Execution}.
   */
  @Validate([
    {
      destruct: (value: EcsExecutionAnchorSchema['properties']): string[] => Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: EcsExecutionAnchorSchema['properties']): string[] => Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
  ])
  override properties = Schema<{
    environmentVariables: Record<string, string>;
  }>();
}
