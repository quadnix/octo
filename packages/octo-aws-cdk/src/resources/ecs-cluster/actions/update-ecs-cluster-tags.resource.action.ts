import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { EcsCluster } from '../ecs-cluster.resource.js';
import type { EcsClusterSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsCluster)
export class UpdateEcsClusterTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<EcsCluster>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<EcsCluster, DiffValueTypeTagUpdate>): Promise<EcsClusterSchema['response']> {
    // Get properties.
    const ecsCluster = diff.node;
    const properties = ecsCluster.properties;
    const response = ecsCluster.response;

    await super.handle(diff, { ...properties, resourceArn: response.clusterArn! });

    return response;
  }

  async mock(diff: Diff<EcsCluster, DiffValueTypeTagUpdate>): Promise<EcsClusterSchema['response']> {
    const ecsCluster = diff.node;
    return ecsCluster.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateEcsClusterTagsResourceAction>(UpdateEcsClusterTagsResourceAction)
export class UpdateEcsClusterTagsResourceActionFactory {
  private static instance: UpdateEcsClusterTagsResourceAction;

  static async create(): Promise<UpdateEcsClusterTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEcsClusterTagsResourceAction(container);
    }
    return this.instance;
  }
}
