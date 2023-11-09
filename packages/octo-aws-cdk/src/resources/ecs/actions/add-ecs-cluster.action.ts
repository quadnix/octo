import { CreateClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IEcsClusterProperties, IEcsClusterResponse } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

@Action(ModelType.RESOURCE)
export class AddEcsClusterAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcsClusterAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'ecs-cluster';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.model as EcsCluster;
    const properties = ecsCluster.properties as unknown as IEcsClusterProperties;
    const response = ecsCluster.response as unknown as IEcsClusterResponse;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Create a new cluster.
    const data = await ecsClient.send(
      new CreateClusterCommand({
        clusterName: properties.clusterName,
      }),
    );

    // Set response.
    response.clusterArn = data.cluster!.clusterArn as string;
  }
}

@Factory<AddEcsClusterAction>(AddEcsClusterAction)
export class AddEcsClusterActionFactory {
  static async create(): Promise<AddEcsClusterAction> {
    return new AddEcsClusterAction();
  }
}
