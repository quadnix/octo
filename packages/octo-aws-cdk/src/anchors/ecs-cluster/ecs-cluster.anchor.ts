import { AAnchor, Anchor, type Environment } from '@quadnix/octo';
import type { EcsClusterAnchorSchema } from './ecs-cluster.anchor.schema.js';

@Anchor('@octo')
export class EcsClusterAnchor extends AAnchor<EcsClusterAnchorSchema, Environment> {
  declare properties: EcsClusterAnchorSchema['properties'];

  constructor(anchorId: string, properties: EcsClusterAnchorSchema['properties'], parent: Environment) {
    super(anchorId, properties, parent);
  }
}
