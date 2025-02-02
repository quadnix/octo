import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class IamRoleAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value: IamRoleAnchorSchema['properties']): string[] => [value.iamRoleName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    iamRoleName: string;
  }>();
}
