import { CreateClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EcsCluster } from '../ecs-cluster.resource.js';
import type { EcsClusterSchema } from '../ecs-cluster.schema.js';

@Action(EcsCluster)
export class AddEcsClusterResourceAction implements IResourceAction<EcsCluster> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcsCluster &&
      (diff.node.constructor as typeof EcsCluster).NODE_NAME === 'ecs-cluster'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node as EcsCluster;
    const properties = ecsCluster.properties;
    const response = ecsCluster.response;

    // Get instances.
    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Create a new cluster.
    const data = await ecsClient.send(
      new CreateClusterCommand({
        clusterName: properties.clusterName,
      }),
    );

    // Set response.
    response.clusterArn = data.cluster!.clusterArn!;
  }

  async mock(diff: Diff, capture: Partial<EcsClusterSchema['response']>): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node as EcsCluster;
    const properties = ecsCluster.properties;

    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ecsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateClusterCommand) {
        return { cluster: { clusterArn: capture.clusterArn } };
      }
    };
  }
}

@Factory<AddEcsClusterResourceAction>(AddEcsClusterResourceAction)
export class AddEcsClusterResourceActionFactory {
  private static instance: AddEcsClusterResourceAction;

  static async create(): Promise<AddEcsClusterResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddEcsClusterResourceAction(container);
    }
    return this.instance;
  }
}
