import { AResource, Resource } from '@quadnix/octo';
import type { IEcsClusterProperties, IEcsClusterResponse } from './ecs-cluster.interface.js';

@Resource('@octo', 'ecs-cluster')
export class EcsCluster extends AResource<EcsCluster> {
  declare properties: IEcsClusterProperties;
  declare response: IEcsClusterResponse;

  constructor(resourceId: string, properties: IEcsClusterProperties) {
    super(resourceId, properties, []);
  }
}
