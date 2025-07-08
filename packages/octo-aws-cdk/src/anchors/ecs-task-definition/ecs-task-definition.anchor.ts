import { AAnchor, Anchor } from '@quadnix/octo';
import type { EcsTaskDefinitionAnchorSchema } from './ecs-task-definition.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class EcsTaskDefinitionAnchor extends AAnchor<
  EcsTaskDefinitionAnchorSchema,
  EcsTaskDefinitionAnchorSchema['parentInstance']
> {
  declare properties: EcsTaskDefinitionAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: EcsTaskDefinitionAnchorSchema['properties'],
    parent: EcsTaskDefinitionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
