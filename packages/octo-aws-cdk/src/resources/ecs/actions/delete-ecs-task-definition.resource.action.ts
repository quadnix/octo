import { DeleteTaskDefinitionsCommand, DeregisterTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IEcsTaskDefinitionProperties, IEcsTaskDefinitionResponse } from '../ecs-task-definition.interface.js';
import type { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEcsTaskDefinitionResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcsTaskDefinitionResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecs-task-definition';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.model as EcsTaskDefinition;
    const properties = ecsTaskDefinition.properties as unknown as IEcsTaskDefinitionProperties;
    const response = ecsTaskDefinition.response as unknown as IEcsTaskDefinitionResponse;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Deregister the task definition.
    await ecsClient.send(
      new DeregisterTaskDefinitionCommand({
        taskDefinition: response.taskDefinitionArn,
      }),
    );
    // Delete the task definition.
    const data = await ecsClient.send(
      new DeleteTaskDefinitionsCommand({
        taskDefinitions: [response.taskDefinitionArn],
      }),
    );

    // Ensure there are no failures.
    if (data.failures && data.failures.length > 0) {
      const error = new Error('Error while deleting task definition!');
      error['data'] = data.failures;
      console.error(error);
    }
  }
}

@Factory<DeleteEcsTaskDefinitionResourceAction>(DeleteEcsTaskDefinitionResourceAction)
export class DeleteEcsTaskDefinitionResourceActionFactory {
  static async create(): Promise<DeleteEcsTaskDefinitionResourceAction> {
    return new DeleteEcsTaskDefinitionResourceAction();
  }
}
