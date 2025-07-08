import { BaseAnchorSchema, type Execution, Schema, Validate } from '@quadnix/octo';

/**
 * @group Anchors/EcsService
 */
export class EcsServiceAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Execution;

  @Validate({
    destruct: (value: EcsServiceAnchorSchema['properties']): number[] => [value.desiredCount],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    desiredCount: number;
  }>();
}
