import { CreateServiceCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { ISecurityGroupResponse } from '../../security-group/security-group.interface.js';
import { SecurityGroup } from '../../security-group/security-group.resource.js';
import { ISubnetResponse } from '../../subnet/subnet.interface.js';
import { Subnet } from '../../subnet/subnet.resource.js';
import { IEcsClusterProperties } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';
import { IEcsServiceProperties, IEcsServiceResponse } from '../ecs-service.interface.js';
import { EcsService } from '../ecs-service.resource.js';
import { IEcsTaskDefinitionResponse } from '../ecs-task-definition.interface.js';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

@Action(ModelType.RESOURCE)
export class AddEcsServiceResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcsServiceResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'ecs-service';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsService = diff.model as EcsService;
    const parents = ecsService.getParents();
    const properties = ecsService.properties as unknown as IEcsServiceProperties;
    const response = ecsService.response as unknown as IEcsServiceResponse;

    const ecsCluster = parents['ecs-cluster'][0].to as EcsCluster;
    const ecsClusterProperties = ecsCluster.properties as unknown as IEcsClusterProperties;

    const ecsTaskDefinition = parents['ecs-task-definition'][0].to as EcsTaskDefinition;
    const ecsTaskDefinitionResponse = ecsTaskDefinition.response as unknown as IEcsTaskDefinitionResponse;

    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

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
            securityGroups: securityGroupList.map((sg) => (sg.response as unknown as ISecurityGroupResponse).GroupId),
            subnets: [subnetResponse.SubnetId],
          },
        },
        serviceName: properties.serviceName,
        taskDefinition: ecsTaskDefinitionResponse.taskDefinitionArn,
      }),
    );

    // Set response.
    response.serviceArn = data.service!.serviceArn as string;
  }
}

@Factory<AddEcsServiceResourceAction>(AddEcsServiceResourceAction)
export class AddEcsServiceResourceActionFactory {
  static async create(): Promise<AddEcsServiceResourceAction> {
    return new AddEcsServiceResourceAction();
  }
}
