import { AAnchor, Anchor } from '@quadnix/octo';
import type { AlbEcsExecutionAnchorSchema } from './alb-ecs-execution.anchor.schema.js';

@Anchor('@octo')
/**
 * @internal
 */
export class AlbEcsExecutionAnchor extends AAnchor<
  AlbEcsExecutionAnchorSchema,
  AlbEcsExecutionAnchorSchema['parentInstance']
> {
  declare properties: AlbEcsExecutionAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AlbEcsExecutionAnchorSchema['properties'],
    parent: AlbEcsExecutionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
