import { AAnchor, Anchor } from '@quadnix/octo';
import type { EcsServiceAnchorSchema } from './ecs-service.anchor.schema.js';

@Anchor('@octo')
/**
 * @internal
 */
export class EcsServiceAnchor extends AAnchor<EcsServiceAnchorSchema, EcsServiceAnchorSchema['parentInstance']> {
  declare properties: EcsServiceAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: EcsServiceAnchorSchema['properties'],
    parent: EcsServiceAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
