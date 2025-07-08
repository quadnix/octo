import { AAnchor, Anchor } from '@quadnix/octo';
import type { IamRoleAnchorSchema } from './iam-role.anchor.schema.js';

@Anchor('@octo')
/**
 * @internal
 */
export class IamRoleAnchor extends AAnchor<IamRoleAnchorSchema, IamRoleAnchorSchema['parentInstance']> {
  declare properties: IamRoleAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: IamRoleAnchorSchema['properties'],
    parent: IamRoleAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
