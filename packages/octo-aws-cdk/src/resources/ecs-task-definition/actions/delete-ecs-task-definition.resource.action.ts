import { DeleteTaskDefinitionsCommand, DeregisterTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

/**
 * @internal
 */
@Action(EcsTaskDefinition)
export class DeleteEcsTaskDefinitionResourceAction implements IResourceAction<EcsTaskDefinition> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcsTaskDefinition &&
      hasNodeName(diff.node, 'ecs-task-definition') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsTaskDefinition>): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node;
    const properties = ecsTaskDefinition.properties;
    const response = ecsTaskDefinition.response;

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
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
        taskDefinitions: [response.taskDefinitionArn!],
      }),
    );

    // Ensure there are no failures.
    if (data.failures && data.failures.length > 0) {
      const error = new Error('Error while deleting task definition!');
      error['data'] = data.failures;
      console.error(error);
    }
  }

  async mock(diff: Diff<EcsTaskDefinition>): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node;
    const properties = ecsTaskDefinition.properties;

    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
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

/**
 * @internal
 */
@Factory<DeleteEcsTaskDefinitionResourceAction>(DeleteEcsTaskDefinitionResourceAction)
export class DeleteEcsTaskDefinitionResourceActionFactory {
  private static instance: DeleteEcsTaskDefinitionResourceAction;

  static async create(): Promise<DeleteEcsTaskDefinitionResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteEcsTaskDefinitionResourceAction(container);
    }
    return this.instance;
  }
}
