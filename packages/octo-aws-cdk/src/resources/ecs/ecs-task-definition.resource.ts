import { AResource, IResource, Resource } from '@quadnix/octo';
import { Efs } from '../efs/efs.resource.js';
import { IamRole } from '../iam/iam-role.resource.js';
import { IEcsTaskDefinitionProperties } from './ecs-task-definition.interface.js';

@Resource()
export class EcsTaskDefinition extends AResource<EcsTaskDefinition> {
  readonly MODEL_NAME: string = 'ecs-task-definition';

  constructor(resourceId: string, properties: IEcsTaskDefinitionProperties, parents: [IamRole, ...Efs[]]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
