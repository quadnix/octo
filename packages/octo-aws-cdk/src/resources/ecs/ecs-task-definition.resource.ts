import { AResource, IResource, Resource } from '@quadnix/octo';
import { IEcsTaskDefinitionProperties } from './ecs-task-definition.interface.js';

@Resource()
export class EcsTaskDefinition extends AResource<EcsTaskDefinition> {
  readonly MODEL_NAME: string = 'ecs-task-definition';

  constructor(resourceId: string, properties: IEcsTaskDefinitionProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
