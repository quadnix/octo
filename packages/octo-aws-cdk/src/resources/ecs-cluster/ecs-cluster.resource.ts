import { AResource, Resource } from '@quadnix/octo';
import { EcsClusterSchema } from './index.schema.js';

@Resource<EcsCluster>('@octo', 'ecs-cluster', EcsClusterSchema)
export class EcsCluster extends AResource<EcsClusterSchema, EcsCluster> {
  declare properties: EcsClusterSchema['properties'];
  declare response: EcsClusterSchema['response'];

  constructor(resourceId: string, properties: EcsClusterSchema['properties']) {
    super(resourceId, properties, []);
  }
}
