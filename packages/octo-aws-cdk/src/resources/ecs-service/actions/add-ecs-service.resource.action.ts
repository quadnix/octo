import { CreateServiceCommand, ECSClient, waitUntilServicesStable } from '@aws-sdk/client-ecs';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
  hasNodeName,
} from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import type { AlbTargetGroupSchema } from '../../alb-target-group/index.schema.js';
import type { SecurityGroupSchema } from '../../security-group/index.schema.js';
import { EcsService } from '../ecs-service.resource.js';
import type { EcsServiceSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsService)
export class AddEcsServiceResourceAction extends ANodeAction implements IResourceAction<EcsService> {
  actionTimeoutInMs: number = 900000; // 15 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcsService &&
      hasNodeName(diff.node, 'ecs-service') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsService>): Promise<EcsServiceSchema['response']> {
    // Get properties.
    const ecsService = diff.node;
    const properties = ecsService.properties;
    const tags = ecsService.tags;
    const ecsServiceEcsCluster = ecsService.parents[0];
    const ecsServiceTaskDefinition = ecsService.parents[1];
    const ecsServiceSubnet = ecsService.parents[2];
    const ecsServiceTargetGroupList = ecsService.parents
      .slice(3)
      .filter((p) => hasNodeName(p.getActual(), 'alb-target-group')) as MatchingResource<AlbTargetGroupSchema>[];
    const ecsServiceSecurityGroupList = ecsService.parents
      .slice(3)
      .filter((p) => hasNodeName(p.getActual(), 'security-group')) as MatchingResource<SecurityGroupSchema>[];

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create a new service.
    const data = await ecsClient.send(
      new CreateServiceCommand({
        cluster: ecsServiceEcsCluster.getSchemaInstanceInResourceAction().properties.clusterName,
        desiredCount: properties.desiredCount,
        launchType: 'FARGATE',
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
        serviceName: properties.serviceName,
        tags: Object.keys(tags).length > 0 ? Object.entries(tags).map(([key, value]) => ({ key, value })) : undefined,
        taskDefinition: ecsServiceTaskDefinition.getSchemaInstanceInResourceAction().response.taskDefinitionArn,
      }),
    );

    // Wait for ECS Service to stabilize.
    this.log('Waiting for ECS Service to stabilize.');
    await waitUntilServicesStable(
      {
        client: ecsClient,
        maxWaitTime: 840, // 14 minutes.
        minDelay: 30,
      },
      {
        cluster: ecsServiceEcsCluster.getSchemaInstanceInResourceAction().properties.clusterName,
        services: [properties.serviceName],
      },
    );

    return {
      serviceArn: data.service!.serviceArn!,
    };
  }

  async mock(
    _diff: Diff<EcsService>,
    capture: Partial<EcsServiceSchema['response']>,
  ): Promise<EcsServiceSchema['response']> {
    return {
      serviceArn: capture.serviceArn!,
    };
  }
}

/**
 * @internal
 */
@Factory<AddEcsServiceResourceAction>(AddEcsServiceResourceAction)
export class AddEcsServiceResourceActionFactory {
  private static instance: AddEcsServiceResourceAction;

  static async create(): Promise<AddEcsServiceResourceAction> {
    if (!this.instance) {
      this.instance = new AddEcsServiceResourceAction();
    }
    return this.instance;
  }
}
