import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IEcsServiceProperties } from '../ecs-service.interface.js';
import type { EcsService, EcsServicePropertyDiff } from '../ecs-service.resource.js';
import type { IEcsTaskDefinitionResponse } from '../ecs-task-definition.interface.js';
import type { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateEcsServiceReplaceTaskDefinitionResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateEcsServiceReplaceTaskDefinitionResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'ecs-service' &&
      diff.field === 'task-definition' &&
      (diff.value as EcsServicePropertyDiff['key']).action === 'replace'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsService = diff.model as EcsService;
    const parents = ecsService.getParents();
    const properties = ecsService.properties as unknown as IEcsServiceProperties;

    const ecsTaskDefinition = parents['ecs-task-definition'][0].to as EcsTaskDefinition;
    const ecsTaskDefinitionResponse = ecsTaskDefinition.response as unknown as IEcsTaskDefinitionResponse;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Update the service with the new task definition.
    await ecsClient.send(
      new UpdateServiceCommand({
        service: properties.serviceName,
        taskDefinition: ecsTaskDefinitionResponse.taskDefinitionArn,
      }),
    );
  }
}

@Factory<UpdateEcsServiceReplaceTaskDefinitionResourceAction>(UpdateEcsServiceReplaceTaskDefinitionResourceAction)
export class UpdateEcsServiceReplaceTaskDefinitionResourceActionFactory {
  static async create(): Promise<UpdateEcsServiceReplaceTaskDefinitionResourceAction> {
    return new UpdateEcsServiceReplaceTaskDefinitionResourceAction();
  }
}
