import { AAnchor, Anchor, type Deployment } from '@quadnix/octo';
import type { EcsTaskDefinitionAnchorSchema } from './ecs-task-definition.anchor.schema.js';

@Anchor('@octo')
export class EcsTaskDefinitionAnchor extends AAnchor<EcsTaskDefinitionAnchorSchema, Deployment> {
  declare properties: EcsTaskDefinitionAnchorSchema['properties'];

  constructor(anchorId: string, properties: EcsTaskDefinitionAnchorSchema['properties'], parent: Deployment) {
    super(anchorId, properties, parent);
  }
}
