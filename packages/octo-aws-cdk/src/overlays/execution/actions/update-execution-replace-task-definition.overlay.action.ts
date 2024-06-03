import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import { EnvironmentVariablesAnchor } from '../../../anchors/environment-variables.anchor.js';
import { TaskDefinitionAnchor } from '../../../anchors/task-definition.anchor.js';
import type { AwsEnvironment } from '../../../models/environment/aws.environment.model.js';
import type { AwsExecution } from '../../../models/execution/aws.execution.model.js';
import type { EcsService } from '../../../resources/ecs/ecs-service.resource.js';
import type { EcsTaskDefinition } from '../../../resources/ecs/ecs-task-definition.resource.js';
import type { IExecutionOverlayProperties } from '../execution.overlay.interface.js';
import type { ExecutionOverlay } from '../execution.overlay.js';

@Action(ModelType.OVERLAY)
export class UpdateExecutionReplaceTaskDefinitionOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateExecutionReplaceTaskDefinitionOverlayAction';

  collectInput(diff: Diff): string[] {
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties as unknown as IExecutionOverlayProperties;

    return [
      `ecs-service-${properties.regionId}-${properties.serverKey}`,
      `ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE && diff.model.MODEL_NAME === 'execution-overlay' && diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // Get properties.
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties as unknown as IExecutionOverlayProperties;

    // ECS TaskDefinition Anchors.
    const taskDefinitionAnchor = executionOverlay
      .getAnchors()
      .find((a) => a instanceof TaskDefinitionAnchor) as TaskDefinitionAnchor;
    const taskDefinitionAnchorProperties = taskDefinitionAnchor.properties;

    // Environment Variables Anchors.
    const environmentVariables: { name: string; value: string }[] = [];
    // Iterate through every EV anchors associated with this overlay to collect final environment variables.
    executionOverlay
      .getAnchors()
      .filter((a) => a instanceof EnvironmentVariablesAnchor)
      .forEach((a: EnvironmentVariablesAnchor) => {
        const parent = a.getParent() as AwsEnvironment | AwsExecution;
        parent.environmentVariables.forEach((value: string, key: string) => {
          const keyIndex = environmentVariables.findIndex((e) => e.name === key);
          if (keyIndex !== -1) {
            environmentVariables[keyIndex].value = value;
          } else {
            environmentVariables.push({ name: key, value });
          }
        });
      });

    const ecsTaskDefinition = actionInputs[
      `ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`
    ] as EcsTaskDefinition;
    ecsTaskDefinition.updateTaskDefinitionEnvironmentVariables(environmentVariables);
    ecsTaskDefinition.updateTaskDefinitionImage({
      command: taskDefinitionAnchorProperties.image.command.split(' '),
      ports: taskDefinitionAnchorProperties.image.ports.map((p) => ({
        containerPort: p.containerPort,
        protocol: p.protocol,
      })),
      uri: taskDefinitionAnchorProperties.image.uri,
    });

    const ecsService = actionInputs[`ecs-service-${properties.regionId}-${properties.serverKey}`] as EcsService;
    ecsService.redeployWithLatestTaskDefinition();

    const output: ActionOutputs = {};
    output[ecsTaskDefinition.resourceId] = ecsTaskDefinition;
    output[ecsService.resourceId] = ecsService;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<UpdateExecutionReplaceTaskDefinitionOverlayAction>(UpdateExecutionReplaceTaskDefinitionOverlayAction)
export class UpdateExecutionReplaceTaskDefinitionOverlayActionFactory {
  static async create(): Promise<UpdateExecutionReplaceTaskDefinitionOverlayAction> {
    return new UpdateExecutionReplaceTaskDefinitionOverlayAction();
  }
}
