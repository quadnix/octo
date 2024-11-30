import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { EcsCluster } from '../../ecs-cluster/index.js';
import type { EcsTaskDefinition } from '../../ecs-task-definition/index.js';
import type { SecurityGroup } from '../../security-group/index.js';
import type { Subnet } from '../../subnet/index.js';
import { EcsService } from '../ecs-service.resource.js';
import type { EcsServiceSchema } from '../ecs-service.schema.js';

@Action(EcsService)
export class UpdateEcsServiceResourceAction implements IResourceAction<EcsService> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof EcsService &&
      (diff.node.constructor as typeof EcsService).NODE_NAME === 'ecs-service'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsService = diff.node as EcsService;
    const parents = ecsService.getParents();
    const properties = ecsService.properties;
    const response = ecsService.response;

    const ecsCluster = parents['ecs-cluster'][0].to as EcsCluster;
    const ecsClusterProperties = ecsCluster.properties;

    const ecsTaskDefinition = parents['ecs-task-definition'][0].to as EcsTaskDefinition;
    const ecsTaskDefinitionResponse = ecsTaskDefinition.response;

    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    const securityGroupList =
      'security-group' in parents ? parents['security-group'].map((d) => d.to as SecurityGroup) : [];

    // Get instances.
    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Update the service.
    const data = await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ecsClusterProperties.clusterName,
        desiredCount: properties.desiredCount,
        networkConfiguration: {
          awsvpcConfiguration: {
            securityGroups: securityGroupList.map((sg) => sg.response.GroupId),
            subnets: [subnetResponse.SubnetId],
          },
        },
        service: properties.serviceName,
        taskDefinition: ecsTaskDefinitionResponse.taskDefinitionArn,
      }),
    );

    // Set response.
    response.serviceArn = data.service!.serviceArn!;
  }

  async mock(diff: Diff, capture: Partial<EcsServiceSchema['response']>): Promise<void> {
    // Get properties.
    const ecsService = diff.node as EcsService;
    const properties = ecsService.properties;

    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ecsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof UpdateServiceCommand) {
        return { service: { serviceArn: capture.serviceArn } };
      }
    };
  }
}

@Factory<UpdateEcsServiceResourceAction>(UpdateEcsServiceResourceAction)
export class UpdateEcsServiceResourceActionFactory {
  static async create(): Promise<UpdateEcsServiceResourceAction> {
    const container = Container.getInstance();
    return new UpdateEcsServiceResourceAction(container);
  }
}
