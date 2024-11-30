import { DeleteTaskDefinitionsCommand, DeregisterTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

@Action(EcsTaskDefinition)
export class DeleteEcsTaskDefinitionResourceAction implements IResourceAction<EcsTaskDefinition> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcsTaskDefinition &&
      (diff.node.constructor as typeof EcsTaskDefinition).NODE_NAME === 'ecs-task-definition'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node as EcsTaskDefinition;
    const properties = ecsTaskDefinition.properties;
    const response = ecsTaskDefinition.response;

    // Get instances.
    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node as EcsTaskDefinition;
    const properties = ecsTaskDefinition.properties;

    const ecsClient = await this.container.get(ECSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ecsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeregisterTaskDefinitionCommand) {
        return;
      } else if (instance instanceof DeleteTaskDefinitionsCommand) {
        return { failures: [] };
      }
    };
  }
}

@Factory<DeleteEcsTaskDefinitionResourceAction>(DeleteEcsTaskDefinitionResourceAction)
export class DeleteEcsTaskDefinitionResourceActionFactory {
  static async create(): Promise<DeleteEcsTaskDefinitionResourceAction> {
    const container = Container.getInstance();
    return new DeleteEcsTaskDefinitionResourceAction(container);
  }
}
