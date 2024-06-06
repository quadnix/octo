import { AResource, type IResource, Resource } from '@quadnix/octo';
import type { Efs } from '../efs/efs.resource.js';
import type { IamRole } from '../iam/iam-role.resource.js';
import type { IEcsTaskDefinitionProperties } from './ecs-task-definition.interface.js';

@Resource()
export class EcsTaskDefinition extends AResource<EcsTaskDefinition> {
  readonly MODEL_NAME: string = 'ecs-task-definition';

  constructor(resourceId: string, properties: IEcsTaskDefinitionProperties, parents: [IamRole, ...Efs[]]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }

  updateTaskDefinitionEnvironmentVariables(
    environmentVariables: IEcsTaskDefinitionProperties['environmentVariables'],
  ): void {
    (this.properties as unknown as IEcsTaskDefinitionProperties).environmentVariables = [...environmentVariables];
  }

  updateTaskDefinitionImage(image: IEcsTaskDefinitionProperties['image']): void {
    (this.properties as unknown as IEcsTaskDefinitionProperties).image = { ...image };
  }
}
