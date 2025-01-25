import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
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
    const properties = ecsService.properties;
    const response = ecsService.response;
    const ecsServiceEcsCluster = ecsService.parents[0];
    const ecsServiceTaskDefinition = ecsService.parents[1];
    const ecsServiceSubnet = ecsService.parents[2];
    const ecsServiceSecurityGroupList = ecsService.parents.slice(3) as (typeof ecsService.parents)[3][];

    // Get instances.
    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Update the service.
    const data = await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ecsServiceEcsCluster.getSchemaInstance().properties.clusterName,
        desiredCount: properties.desiredCount,
        networkConfiguration: {
          awsvpcConfiguration: {
            securityGroups: ecsServiceSecurityGroupList.map((sg) => sg.getSchemaInstance().response.GroupId),
            subnets: [ecsServiceSubnet.getSchemaInstance().response.SubnetId],
          },
        },
        service: properties.serviceName,
        taskDefinition: ecsServiceTaskDefinition.getSchemaInstance().response.taskDefinitionArn,
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
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
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
  private static instance: UpdateEcsServiceResourceAction;

  static async create(): Promise<UpdateEcsServiceResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEcsServiceResourceAction(container);
    }
    return this.instance;
  }
}
