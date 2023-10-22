import { IResource, Resource } from '@quadnix/octo';
import { IEcsClusterProperties } from './ecs-cluster.interface.js';

export class EcsCluster extends Resource<EcsCluster> {
  readonly MODEL_NAME: string = 'ecs-cluster';

  constructor(resourceId: string, properties: IEcsClusterProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
