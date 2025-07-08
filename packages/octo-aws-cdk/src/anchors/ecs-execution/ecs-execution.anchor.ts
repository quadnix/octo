import { AAnchor, Anchor } from '@quadnix/octo';
import type { EcsExecutionAnchorSchema } from './ecs-execution.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class EcsExecutionAnchor extends AAnchor<EcsExecutionAnchorSchema, EcsExecutionAnchorSchema['parentInstance']> {
  declare properties: EcsExecutionAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: EcsExecutionAnchorSchema['properties'],
    parent: EcsExecutionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
