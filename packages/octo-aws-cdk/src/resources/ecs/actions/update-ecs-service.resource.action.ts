import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { SecurityGroup } from '../../security-group/security-group.resource.js';
import type { Subnet } from '../../subnet/subnet.resource.js';
import { EcsService } from '../ecs-service.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateEcsServiceResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateEcsServiceResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model instanceof EcsService &&
      diff.model.MODEL_NAME === 'ecs-service' &&
      diff.field === 'ecs-service'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsService = diff.model as EcsService;
    const parents = ecsService.getParents();
    const properties = ecsService.properties;

    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    const securityGroupList =
      'security-group' in parents ? parents['security-group'].map((d) => d.to as SecurityGroup) : [];

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Update the service.
    await ecsClient.send(
      new UpdateServiceCommand({
        desiredCount: properties.desiredCount,
        networkConfiguration: {
          awsvpcConfiguration: {
            securityGroups: securityGroupList.map((sg) => sg.response.GroupId),
            subnets: [subnetResponse.SubnetId],
          },
        },
        service: properties.serviceName,
      }),
    );
  }
}

@Factory<UpdateEcsServiceResourceAction>(UpdateEcsServiceResourceAction)
export class UpdateEcsServiceResourceActionFactory {
  static async create(): Promise<UpdateEcsServiceResourceAction> {
    return new UpdateEcsServiceResourceAction();
  }
}
