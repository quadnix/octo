import { AAnchor, Anchor } from '@quadnix/octo';
import type { EcsServerAnchorSchema } from './ecs-server.anchor.schema.js';

@Anchor('@octo')
export class EcsServerAnchor extends AAnchor<EcsServerAnchorSchema, EcsServerAnchorSchema['parentInstance']> {
  declare properties: EcsServerAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: EcsServerAnchorSchema['properties'],
    parent: EcsServerAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
