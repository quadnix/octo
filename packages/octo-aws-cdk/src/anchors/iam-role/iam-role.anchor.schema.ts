import { BaseAnchorSchema, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Server} model representing an AWS IAM role.
 *
 * @group Anchors/IamRole
 *
 * @hideconstructor
 */
export class IamRoleAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Server;

  /**
   * Input properties.
   * * `properties.iamRoleName`: The name of the IAM role.
   */
  @Validate({
    destruct: (value: IamRoleAnchorSchema['properties']): string[] => [value.iamRoleName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    iamRoleName: string;
  }>();
}
