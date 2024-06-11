import { AResource, Resource } from '@quadnix/octo';
import type { IEcsClusterProperties, IEcsClusterResponse } from './ecs-cluster.interface.js';

@Resource()
export class EcsCluster extends AResource<EcsCluster> {
  readonly MODEL_NAME: string = 'ecs-cluster';

  declare properties: IEcsClusterProperties;
  declare response: IEcsClusterResponse;

  constructor(resourceId: string, properties: IEcsClusterProperties) {
    super(resourceId, properties, []);
  }
}
