import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import type { EcsService } from '../../../resources/ecs/ecs-service.resource.js';
import type { EcsTaskDefinition } from '../../../resources/ecs/ecs-task-definition.resource.js';
import type { IExecutionOverlayProperties } from '../execution.overlay.interface.js';
import type { ExecutionOverlay } from '../execution.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteExecutionOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteExecutionOverlayAction';

  collectInput(diff: Diff): string[] {
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties as unknown as IExecutionOverlayProperties;

    return [
      `resource.ecs-service-${properties.regionId}-${properties.serverKey}`,
      `resource.ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'execution-overlay' && diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // Get properties.
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties as unknown as IExecutionOverlayProperties;

    const ecsService = actionInputs[
      `resource.ecs-service-${properties.regionId}-${properties.serverKey}`
    ] as EcsService;
    ecsService.markDeleted();

    const ecsTaskDefinition = actionInputs[
      `resource.ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`
    ] as EcsTaskDefinition;
    ecsTaskDefinition.markDeleted();

    const output: ActionOutputs = {};
    output[ecsService.resourceId] = ecsService;
    output[ecsTaskDefinition.resourceId] = ecsTaskDefinition;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteExecutionOverlayAction>(DeleteExecutionOverlayAction)
export class DeleteExecutionOverlayActionFactory {
  static async create(): Promise<DeleteExecutionOverlayAction> {
    return new DeleteExecutionOverlayAction();
  }
}
