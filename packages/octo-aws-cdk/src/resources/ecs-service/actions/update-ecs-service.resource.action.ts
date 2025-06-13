import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import {
  AResource,
  Action,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
} from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import type { AlbTargetGroupSchema } from '../../alb-target-group/index.schema.js';
import type { SecurityGroupSchema } from '../../security-group/index.schema.js';
import { EcsService } from '../ecs-service.resource.js';
import type { EcsServiceSchema } from '../index.schema.js';

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
    const ecsServiceTargetGroupList = ecsService.parents
      .slice(3)
      .filter(
        (p) => (p.getActual().constructor as typeof AResource).NODE_NAME === 'alb-target-group',
      ) as MatchingResource<AlbTargetGroupSchema>[];
    const ecsServiceSecurityGroupList = ecsService.parents
      .slice(3)
      .filter(
        (p) => (p.getActual().constructor as typeof AResource).NODE_NAME === 'security-group',
      ) as MatchingResource<SecurityGroupSchema>[];

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Update the service.
    const data = await ecsClient.send(
      new UpdateServiceCommand({
        cluster: ecsServiceEcsCluster.getSchemaInstanceInResourceAction().properties.clusterName,
        desiredCount: properties.desiredCount,
        loadBalancers: properties.loadBalancers.map((lb) => ({
          containerName: lb.containerName,
          containerPort: lb.containerPort,
          targetGroupArn: ecsServiceTargetGroupList
            .find((tg) => tg.getSchemaInstanceInResourceAction().properties.Name === lb.targetGroupName)!
            .getSchemaInstanceInResourceAction().response.TargetGroupArn,
        })),
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: properties.assignPublicIp,
            securityGroups: ecsServiceSecurityGroupList.map(
              (sg) => sg.getSchemaInstanceInResourceAction().response.GroupId,
            ),
            subnets: [ecsServiceSubnet.getSchemaInstanceInResourceAction().response.SubnetId],
          },
        },
        service: properties.serviceName,
        taskDefinition: ecsServiceTaskDefinition.getSchemaInstanceInResourceAction().response.taskDefinitionArn,
      }),
    );

    // Set response.
    response.serviceArn = data.service!.serviceArn!;
  }

  async mock(diff: Diff, capture: Partial<EcsServiceSchema['response']>): Promise<void> {
    // Get properties.
    const ecsService = diff.node as EcsService;
    const properties = ecsService.properties;

    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
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
