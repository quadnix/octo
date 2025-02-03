import { AAnchor, Anchor, type Execution, type Server } from '@quadnix/octo';
import type { SecurityGroupAnchorSchema } from './security-group.anchor.schema.js';

@Anchor('@octo')
export class SecurityGroupAnchor extends AAnchor<SecurityGroupAnchorSchema, Execution | Server> {
  declare properties: SecurityGroupAnchorSchema['properties'];

  constructor(anchorId: string, properties: SecurityGroupAnchorSchema['properties'], parent: Execution | Server) {
    super(anchorId, properties, parent);
  }
}
