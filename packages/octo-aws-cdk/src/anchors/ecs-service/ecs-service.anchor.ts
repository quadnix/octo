import { AAnchor, Anchor, type Execution } from '@quadnix/octo';
import type { EcsServiceAnchorSchema } from './ecs-service.anchor.schema.js';

@Anchor('@octo')
export class EcsServiceAnchor extends AAnchor<EcsServiceAnchorSchema, Execution> {
  declare properties: EcsServiceAnchorSchema['properties'];

  constructor(anchorId: string, properties: EcsServiceAnchorSchema['properties'], parent: Execution) {
    super(anchorId, properties, parent);
  }
}
