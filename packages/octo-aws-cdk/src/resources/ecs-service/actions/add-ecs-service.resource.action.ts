import { CreateServiceCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EcsTaskDefinition } from '../../ecs-task-definition/index.js';
import type { SecurityGroup } from '../../security-group/index.js';
import type { Subnet } from '../../subnet/index.js';
import type { EcsCluster } from '../../ecs-cluster/index.js';
import type { IEcsServiceResponse } from '../ecs-service.interface.js';
import { EcsService } from '../ecs-service.resource.js';

@Action(EcsService)
export class AddEcsServiceResourceAction implements IResourceAction {
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

    const ecsCluster = parents['ecs-cluster'][0].to as EcsCluster;
    const ecsClusterProperties = ecsCluster.properties;

    const ecsTaskDefinition = parents['ecs-task-definition'][0].to as EcsTaskDefinition;
    const ecsTaskDefinitionResponse = ecsTaskDefinition.response;

    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    const securityGroupList =
      'security-group' in parents ? parents['security-group'].map((d) => d.to as SecurityGroup) : [];

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

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

  async mock(capture: Partial<IEcsServiceResponse>): Promise<void> {
    const ecsClient = await Container.get(ECSClient, { args: ['mock'] });
    ecsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateServiceCommand) {
        return { service: { serviceArn: capture.serviceArn } };
      }
    };
  }
}

@Factory<AddEcsServiceResourceAction>(AddEcsServiceResourceAction)
export class AddEcsServiceResourceActionFactory {
  static async create(): Promise<AddEcsServiceResourceAction> {
    return new AddEcsServiceResourceAction();
  }
}