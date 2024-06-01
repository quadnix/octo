import { DeleteServiceCommand, DescribeServicesCommand, ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { IEcsClusterProperties } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';
import { IEcsServiceProperties } from '../ecs-service.interface.js';
import { EcsService } from '../ecs-service.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEcsServiceResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcsServiceResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecs-service';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsService = diff.model as EcsService;
    const properties = ecsService.properties as unknown as IEcsServiceProperties;

    const ecsCluster = ecsService.getParents('ecs-cluster')['ecs-cluster'][0].to as EcsCluster;
    const ecsClusterProperties = ecsCluster.properties as unknown as IEcsClusterProperties;

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
}

@Factory<DeleteEcsServiceResourceAction>(DeleteEcsServiceResourceAction)
export class DeleteEcsServiceResourceActionFactory {
  static async create(): Promise<DeleteEcsServiceResourceAction> {
    return new DeleteEcsServiceResourceAction();
  }
}
