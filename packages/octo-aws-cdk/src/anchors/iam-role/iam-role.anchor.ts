import { AAnchor, Anchor, type Server } from '@quadnix/octo';
import type { IamRoleAnchorSchema } from './iam-role.anchor.schema.js';

@Anchor('@octo')
export class IamRoleAnchor extends AAnchor<IamRoleAnchorSchema, Server> {
  declare properties: IamRoleAnchorSchema['properties'];

  constructor(anchorId: string, properties: IamRoleAnchorSchema['properties'], parent: Server) {
    super(anchorId, properties, parent);
  }
}
