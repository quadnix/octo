import { DeleteServiceCommand, DescribeServicesCommand, ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { EcsService } from '../ecs-service.resource.js';

/**
 * @internal
 */
@Action(EcsService)
export class DeleteEcsServiceResourceAction extends ANodeAction implements IResourceAction<EcsService> {
  actionTimeoutInMs: number = 900000; // 15 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcsService &&
      hasNodeName(diff.node, 'ecs-service') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsService>): Promise<void> {
    // Get properties.
    const ecsService = diff.node;
    const properties = ecsService.properties;
    const ecsServiceEcsCluster = ecsService.parents[0];

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if service is ACTIVE.
    const describeResult = await ecsClient.send(
      new DescribeServicesCommand({
        cluster: ecsServiceEcsCluster.getSchemaInstance().properties.clusterName,
        services: [properties.serviceName],
      }),
    );
    if (describeResult.services?.length === 0 || describeResult.services![0].status!.toUpperCase() === 'INACTIVE') {
      return;
    }

    // Scale down the service to 0.
    await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ecsServiceEcsCluster.getSchemaInstance().properties.clusterName,
        desiredCount: 0,
        service: properties.serviceName,
      }),
    );

    // Wait for tasks to be stopped.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Waiting for ecs-service tasks to be stopped.');

        const result = await ecsClient.send(
          new DescribeServicesCommand({
            cluster: ecsServiceEcsCluster.getSchemaInstance().properties.clusterName,
            services: [properties.serviceName],
          }),
        );

        return result.services?.length === 1 && result.services[0].runningCount === 0;
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );

    // Delete the service.
    await ecsClient.send(
      new DeleteServiceCommand({
        cluster: ecsServiceEcsCluster.getSchemaInstance().properties.clusterName,
        service: properties.serviceName,
      }),
    );

    // Wait for service to be Inactive.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Waiting for ecs-service to be Inactive.');

        const result = await ecsClient.send(
          new DescribeServicesCommand({
            cluster: ecsServiceEcsCluster.getSchemaInstance().properties.clusterName,
            services: [properties.serviceName],
          }),
        );

        if (!result.services || result.services.length === 0) {
          return true;
        }
        return result.services?.length === 1 && result.services[0].status!.toUpperCase() === 'INACTIVE';
      },
      {
        maxRetries: 20,
        retryDelayInMs: 30000,
      },
    );

    // Wait for network interfaces used by the tasks to be deleted.
    this.log('Waiting for network interfaces used by the tasks to be deleted.');
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }

  async mock(diff: Diff<EcsService>): Promise<void> {
    // Get properties.
    const ecsService = diff.node;
    const properties = ecsService.properties;

    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ecsClient.send = async (instance: unknown): Promise<unknown> => {
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

/**
 * @internal
 */
@Factory<DeleteEcsServiceResourceAction>(DeleteEcsServiceResourceAction)
export class DeleteEcsServiceResourceActionFactory {
  private static instance: DeleteEcsServiceResourceAction;

  static async create(): Promise<DeleteEcsServiceResourceAction> {
    if (!this.instance) {
      this.instance = new DeleteEcsServiceResourceAction();
    }
    return this.instance;
  }
}
