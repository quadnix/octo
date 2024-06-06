import { AResource, type IResource, Resource } from '@quadnix/octo';
import type { IEcsClusterProperties } from './ecs-cluster.interface.js';

@Resource()
export class EcsCluster extends AResource<EcsCluster> {
  readonly MODEL_NAME: string = 'ecs-cluster';

  constructor(resourceId: string, properties: IEcsClusterProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
