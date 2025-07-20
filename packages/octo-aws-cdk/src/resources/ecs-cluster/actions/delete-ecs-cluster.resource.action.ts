import { DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

/**
 * @internal
 */
@Action(EcsCluster)
export class DeleteEcsClusterResourceAction implements IResourceAction<EcsCluster> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcsCluster &&
      hasNodeName(diff.node, 'ecs-cluster') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsCluster>): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node;
    const properties = ecsCluster.properties;

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    await ecsClient.send(
      new DeleteClusterCommand({
        cluster: properties.clusterName,
      }),
    );
  }

  async mock(diff: Diff<EcsCluster>): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node;
    const properties = ecsCluster.properties;

    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ecsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteClusterCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteEcsClusterResourceAction>(DeleteEcsClusterResourceAction)
export class DeleteEcsClusterResourceActionFactory {
  private static instance: DeleteEcsClusterResourceAction;

  static async create(): Promise<DeleteEcsClusterResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteEcsClusterResourceAction(container);
    }
    return this.instance;
  }
}
