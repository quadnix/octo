import { AAnchor, Anchor, type Server } from '@quadnix/octo';
import type { SecurityGroupAnchorSchema } from './security-group.anchor.schema.js';

@Anchor('@octo')
export class SecurityGroupAnchor extends AAnchor<SecurityGroupAnchorSchema, Server> {
  declare properties: SecurityGroupAnchorSchema['properties'];

  constructor(anchorId: string, properties: SecurityGroupAnchorSchema['properties'], parent: Server) {
    super(anchorId, properties, parent);
  }
}
