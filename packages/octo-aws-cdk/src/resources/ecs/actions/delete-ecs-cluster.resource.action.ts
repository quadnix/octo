import { DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { EcsCluster } from '../ecs-cluster.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEcsClusterResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcsClusterResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model instanceof EcsCluster && diff.model.MODEL_NAME === 'ecs-cluster'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.model as EcsCluster;
    const properties = ecsCluster.properties;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    await ecsClient.send(
      new DeleteClusterCommand({
        cluster: properties.clusterName,
      }),
    );
  }

  async mock(): Promise<void> {
    const ecsClient = await Container.get(ECSClient);
    ecsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteClusterCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteEcsClusterResourceAction>(DeleteEcsClusterResourceAction)
export class DeleteEcsClusterResourceActionFactory {
  static async create(): Promise<DeleteEcsClusterResourceAction> {
    return new DeleteEcsClusterResourceAction();
  }
}
