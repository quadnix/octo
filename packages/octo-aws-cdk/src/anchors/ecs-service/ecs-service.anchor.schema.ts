import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class EcsServiceAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value: EcsServiceAnchorSchema['properties']): number[] => [value.desiredCount],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    desiredCount: number;
  }>();
}
