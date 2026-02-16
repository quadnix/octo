import { AResource, Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { EcsClusterSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcsCluster>('@octo', 'ecs-cluster', EcsClusterSchema)
export class EcsCluster extends AResource<EcsClusterSchema, EcsCluster> {
  declare properties: EcsClusterSchema['properties'];
  declare response: EcsClusterSchema['response'];

  constructor(resourceId: string, properties: EcsClusterSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: EcsCluster): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update ECS Cluster immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
