import { DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IEcsClusterProperties } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEcsClusterAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcsClusterAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecs-cluster';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.model as EcsCluster;
    const properties = ecsCluster.properties as unknown as IEcsClusterProperties;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    await ecsClient.send(
      new DeleteClusterCommand({
        cluster: properties.clusterName,
      }),
    );
  }
}

@Factory<DeleteEcsClusterAction>(DeleteEcsClusterAction)
export class DeleteEcsClusterActionFactory {
  static async create(): Promise<DeleteEcsClusterAction> {
    return new DeleteEcsClusterAction();
  }
}
