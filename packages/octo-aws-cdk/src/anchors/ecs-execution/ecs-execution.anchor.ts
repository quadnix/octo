import { AAnchor, Anchor, type Execution } from '@quadnix/octo';
import { EcsExecutionAnchorSchema } from './ecs-execution.anchor.schema.js';

@Anchor('@octo')
export class EcsExecutionAnchor extends AAnchor<EcsExecutionAnchorSchema, Execution> {
  declare properties: EcsExecutionAnchorSchema['properties'];

  constructor(anchorId: string, properties: EcsExecutionAnchorSchema['properties'], parent: Execution) {
    super(anchorId, properties, parent);
  }
}
