import { CreateClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IEcsClusterProperties, IEcsClusterResponse } from '../ecs-cluster.interface.js';
import type { EcsCluster } from '../ecs-cluster.resource.js';

@Action(ModelType.RESOURCE)
export class AddEcsClusterResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcsClusterResourceAction';

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

@Factory<AddEcsClusterResourceAction>(AddEcsClusterResourceAction)
export class AddEcsClusterResourceActionFactory {
  static async create(): Promise<AddEcsClusterResourceAction> {
    return new AddEcsClusterResourceAction();
  }
}
