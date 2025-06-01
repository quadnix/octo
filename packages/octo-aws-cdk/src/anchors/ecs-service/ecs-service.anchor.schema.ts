import { BaseAnchorSchema, type Execution, Schema, Validate } from '@quadnix/octo';

export class EcsServiceAnchorSchema extends BaseAnchorSchema {
  parentInstance: Execution;

  @Validate({
    destruct: (value: EcsServiceAnchorSchema['properties']): number[] => [value.desiredCount],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    desiredCount: number;
  }>();
}
