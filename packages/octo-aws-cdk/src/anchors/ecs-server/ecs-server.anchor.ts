import { AAnchor, Anchor, type Server } from '@quadnix/octo';
import type { EcsServerAnchorSchema } from './ecs-server.anchor.schema.js';

@Anchor('@octo')
export class EcsServerAnchor extends AAnchor<EcsServerAnchorSchema, Server> {
  declare properties: EcsServerAnchorSchema['properties'];

  constructor(anchorId: string, properties: EcsServerAnchorSchema['properties'], parent: Server) {
    super(anchorId, properties, parent);
  }
}
