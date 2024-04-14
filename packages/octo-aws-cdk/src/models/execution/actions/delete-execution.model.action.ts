import {
  Action,
  ActionInputs,
  ActionOutputs,
  Deployment,
  Diff,
  DiffAction,
  Execution,
  Factory,
  IModelAction,
  ModelType,
  Server,
} from '@quadnix/octo';
import { EcsService } from '../../../resources/ecs/ecs-service.resource.js';
import { EcsTaskDefinition } from '../../../resources/ecs/ecs-task-definition.resource.js';

@Action(ModelType.MODEL)
export class DeleteExecutionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteExecutionModelAction';

  collectInput(diff: Diff): string[] {
    const execution = diff.model as Execution;
    const deployment = execution.getParents()['deployment'][0].to as Deployment;
    const server = deployment.getParents()['server'][0].to as Server;

    return [`resource.ecs-task-definition-${server.serverKey}`, `resource.ecs-service-${server.serverKey}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'execution' && diff.field === 'executionId';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // Get properties.
    const execution = diff.model as Execution;
    const deployment = execution.getParents()['deployment'][0].to as Deployment;
    const server = deployment.getParents()['server'][0].to as Server;

    const ecsService = actionInputs[`resource.ecs-service-${server.serverKey}`] as EcsService;
    ecsService.markDeleted();

    const ecsTaskDefinition = actionInputs[`resource.ecs-task-definition-${server.serverKey}`] as EcsTaskDefinition;
    ecsTaskDefinition.markDeleted();

    const output: ActionOutputs = {};
    output[ecsTaskDefinition.resourceId] = ecsTaskDefinition;
    output[ecsService.resourceId] = ecsService;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteExecutionModelAction>(DeleteExecutionModelAction)
export class DeleteExecutionModelActionFactory {
  static async create(): Promise<DeleteExecutionModelAction> {
    return new DeleteExecutionModelAction();
  }
}
