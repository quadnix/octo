import { BaseAnchorSchema, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * @group Anchors/IamRole
 *
 * @hideconstructor
 */
export class IamRoleAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Server;

  @Validate({
    destruct: (value: IamRoleAnchorSchema['properties']): string[] => [value.iamRoleName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    iamRoleName: string;
  }>();
}
