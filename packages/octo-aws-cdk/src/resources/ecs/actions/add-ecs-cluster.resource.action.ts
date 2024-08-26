import { CreateClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { IEcsClusterResponse } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

@Action(NodeType.RESOURCE)
export class AddEcsClusterResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcsClusterResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node instanceof EcsCluster && diff.node.NODE_NAME === 'ecs-cluster';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node as EcsCluster;
    const properties = ecsCluster.properties;
    const response = ecsCluster.response;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Create a new cluster.
    const data = await ecsClient.send(
      new CreateClusterCommand({
        clusterName: properties.clusterName,
      }),
    );

    // Set response.
    response.clusterArn = data.cluster!.clusterArn!;
  }

  async mock(capture: Partial<IEcsClusterResponse>): Promise<void> {
    const ecsClient = await Container.get(ECSClient);
    ecsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateClusterCommand) {
        return { cluster: { clusterArn: capture.clusterArn } };
      }
    };
  }
}

@Factory<AddEcsClusterResourceAction>(AddEcsClusterResourceAction)
export class AddEcsClusterResourceActionFactory {
  static async create(): Promise<AddEcsClusterResourceAction> {
    return new AddEcsClusterResourceAction();
  }
}
