import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

export class AlbEcsExecutionAnchorSchema extends BaseAnchorSchema {
  parentInstance: Service;

  @Validate({
    destruct: (value: AlbEcsExecutionAnchorSchema['properties']): string[] => [value.albName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    albName: string;
  }>();
}
