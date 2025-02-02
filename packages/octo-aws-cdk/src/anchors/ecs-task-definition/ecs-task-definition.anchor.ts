import { AAnchor, Anchor, type Deployment } from '@quadnix/octo';
import { TaskDefinitionUtility } from '../../utilities/task-definition/task-definition.utility.js';
import type { EcsTaskDefinitionAnchorSchema } from './ecs-task-definition.anchor.schema.js';

@Anchor('@octo')
export class EcsTaskDefinitionAnchor extends AAnchor<EcsTaskDefinitionAnchorSchema, Deployment> {
  declare properties: EcsTaskDefinitionAnchorSchema['properties'];

  constructor(anchorId: string, properties: EcsTaskDefinitionAnchorSchema['properties'], parent: Deployment) {
    if (!TaskDefinitionUtility.isCpuAndMemoryValid(properties.cpu, properties.memory)) {
      throw new Error('Invalid values for CPU and/or memory!');
    }

    super(anchorId, properties, parent);
  }
}
