import { BaseAnchorSchema, type Execution, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Execution} model representing an AWS ECS service.
 *
 * @group Anchors/EcsService
 *
 * @hideconstructor
 */
export class EcsServiceAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Execution;

  /**
   * Input properties.
   * * `properties.desiredCount`: The desired number of tasks.
   */
  @Validate({
    destruct: (value: EcsServiceAnchorSchema['properties']): number[] => [value.desiredCount],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    desiredCount: number;
  }>();
}
