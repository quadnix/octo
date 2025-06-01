import { AAnchor, Anchor } from '@quadnix/octo';
import type { EcsClusterAnchorSchema } from './ecs-cluster.anchor.schema.js';

@Anchor('@octo')
export class EcsClusterAnchor extends AAnchor<EcsClusterAnchorSchema, EcsClusterAnchorSchema['parentInstance']> {
  declare properties: EcsClusterAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: EcsClusterAnchorSchema['properties'],
    parent: EcsClusterAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
