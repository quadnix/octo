import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

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

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node as EcsCluster;
    const properties = ecsCluster.properties;
    const response = ecsCluster.response;

    await super.handle(diff, { ...properties, resourceArn: response.clusterArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node as EcsCluster;
    const properties = ecsCluster.properties;

    await super.mock(diff, properties);
  }
}

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
