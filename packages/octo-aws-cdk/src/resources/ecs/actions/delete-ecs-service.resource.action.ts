import { DeleteServiceCommand, DescribeServicesCommand, ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { EcsCluster } from '../ecs-cluster.resource.js';
import { EcsService } from '../ecs-service.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteEcsServiceResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcsServiceResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.node instanceof EcsService && diff.node.NODE_NAME === 'ecs-service'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsService = diff.node as EcsService;
    const properties = ecsService.properties;

    const ecsCluster = ecsService.getParents('ecs-cluster')['ecs-cluster'][0].to as EcsCluster;
    const ecsClusterProperties = ecsCluster.properties;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Scale down the service to 0.
    await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ecsClusterProperties.clusterName,
        desiredCount: 0,
        service: properties.serviceName,
      }),
    );

    // Wait for tasks to be stopped.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await ecsClient.send(
          new DescribeServicesCommand({
            cluster: ecsClusterProperties.clusterName,
            services: [properties.serviceName],
          }),
        );

        return result.services?.length === 1 && result.services[0].status!.toUpperCase() === 'INACTIVE';
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );

    // Delete the service.
    await ecsClient.send(
      new DeleteServiceCommand({
        cluster: ecsClusterProperties.clusterName,
        service: properties.serviceName,
      }),
    );
  }

  async mock(): Promise<void> {
    const ecsClient = await Container.get(ECSClient);
    ecsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof UpdateServiceCommand) {
        return;
      } else if (instance instanceof DescribeServicesCommand) {
        return { services: [{ status: 'INACTIVE' }] };
      } else if (instance instanceof DeleteServiceCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteEcsServiceResourceAction>(DeleteEcsServiceResourceAction)
export class DeleteEcsServiceResourceActionFactory {
  static async create(): Promise<DeleteEcsServiceResourceAction> {
    return new DeleteEcsServiceResourceAction();
  }
}
