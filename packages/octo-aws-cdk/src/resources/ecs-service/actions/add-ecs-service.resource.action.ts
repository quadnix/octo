import { CreateServiceCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EcsService } from '../ecs-service.resource.js';
import type {
  EcsServiceSchema,
  EcsServiceSecurityGroup,
  EcsServiceSubnet,
  EcsServiceTaskDefinition,
  EcsTaskDefinitionEcsCluster,
} from '../ecs-service.schema.js';

@Action(EcsService)
export class AddEcsServiceResourceAction implements IResourceAction<EcsService> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
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

    const ecsCluster = parents['ecs-cluster'][0].to as EcsTaskDefinitionEcsCluster;
    const ecsClusterProperties = ecsCluster.properties;

    const ecsTaskDefinition = parents['ecs-task-definition'][0].to as EcsServiceTaskDefinition;
    const ecsTaskDefinitionResponse = ecsTaskDefinition.response;

    const subnet = parents['subnet'][0].to as EcsServiceSubnet;
    const subnetResponse = subnet.response;

    const securityGroupList =
      'security-group' in parents ? parents['security-group'].map((d) => d.to as EcsServiceSecurityGroup) : [];

    // Get instances.
    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Create a new service.
    const data = await ecsClient.send(
      new CreateServiceCommand({
        cluster: ecsClusterProperties.clusterName,
        desiredCount: properties.desiredCount,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            securityGroups: securityGroupList.map((sg) => sg.response.GroupId),
            subnets: [subnetResponse.SubnetId],
          },
        },
        serviceName: properties.serviceName,
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
      if (instance instanceof CreateServiceCommand) {
        return { service: { serviceArn: capture.serviceArn } };
      }
    };
  }
}

@Factory<AddEcsServiceResourceAction>(AddEcsServiceResourceAction)
export class AddEcsServiceResourceActionFactory {
  private static instance: AddEcsServiceResourceAction;

  static async create(): Promise<AddEcsServiceResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddEcsServiceResourceAction(container);
    }
    return this.instance;
  }
}
