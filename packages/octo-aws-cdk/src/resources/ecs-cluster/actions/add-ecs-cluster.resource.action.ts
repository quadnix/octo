import { CreateClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { EcsCluster } from '../ecs-cluster.resource.js';
import type { EcsClusterSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsCluster)
export class AddEcsClusterResourceAction implements IResourceAction<EcsCluster> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcsCluster &&
      hasNodeName(diff.node, 'ecs-cluster') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsCluster>): Promise<EcsClusterSchema['response']> {
    // Get properties.
    const ecsCluster = diff.node;
    const properties = ecsCluster.properties;
    const tags = ecsCluster.tags;

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create a new cluster.
    const data = await ecsClient.send(
      new CreateClusterCommand({
        clusterName: properties.clusterName,
        tags: Object.keys(tags).length > 0 ? Object.entries(tags).map(([key, value]) => ({ key, value })) : undefined,
      }),
    );

    return {
      clusterArn: data.cluster!.clusterArn!,
    };
  }

  async mock(
    _diff: Diff<EcsCluster>,
    capture: Partial<EcsClusterSchema['response']>,
  ): Promise<EcsClusterSchema['response']> {
    return {
      clusterArn: capture.clusterArn,
    };
  }
}

/**
 * @internal
 */
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
