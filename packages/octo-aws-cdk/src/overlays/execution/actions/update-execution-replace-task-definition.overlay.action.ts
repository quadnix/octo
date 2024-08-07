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
import { EnvironmentVariablesAnchor } from '../../../anchors/environment-variables.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../../anchors/subnet-filesystem-mount.anchor.js';
import { TaskDefinitionAnchor } from '../../../anchors/task-definition.anchor.js';
import type { AwsEnvironment } from '../../../models/environment/aws.environment.model.js';
import type { AwsExecution } from '../../../models/execution/aws.execution.model.js';
import type { EcsService } from '../../../resources/ecs/ecs-service.resource.js';
import type { EcsTaskDefinition } from '../../../resources/ecs/ecs-task-definition.resource.js';
import type { Efs } from '../../../resources/efs/efs.resource.js';
import { ExecutionOverlay } from '../execution.overlay.js';

@Action(ModelType.OVERLAY)
export class UpdateExecutionReplaceTaskDefinitionOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateExecutionReplaceTaskDefinitionOverlayAction';

  collectInput(diff: Diff): string[] {
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties;

    const efsResources = executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SubnetFilesystemMountAnchor)
      .map((a: SubnetFilesystemMountAnchor) => `resource.efs-${properties.regionId}-${a.properties.filesystemName}`);

    return [
      `resource.ecs-service-${properties.regionId}-${properties.serverKey}`,
      `resource.ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`,
      ...efsResources,
    ];
  }

  filter(diff: Diff): boolean {
    if (
      diff.model instanceof ExecutionOverlay &&
      diff.model.MODEL_NAME === 'execution-overlay' &&
      diff.field === 'anchor'
    ) {
      if (diff.value instanceof TaskDefinitionAnchor) {
        return diff.action === DiffAction.UPDATE;
      } else if (diff.value instanceof SubnetFilesystemMountAnchor) {
        return diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    // Get properties.
    const executionOverlay = diff.model as ExecutionOverlay;
    const properties = executionOverlay.properties;

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
      `resource.ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`
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

    // EFS Mount Anchors.
    // Iterate through every filesystem mount associated with this overlay to add respective EFS as parent.
    const efsList = executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SubnetFilesystemMountAnchor)
      .map(
        (a: SubnetFilesystemMountAnchor) =>
          actionInputs[`resource.efs-${properties.regionId}-${a.properties.filesystemName}`] as Efs,
      );
    ecsTaskDefinition.updateTaskDefinitionEfs(efsList);
    actionOutputs[ecsTaskDefinition.resourceId] = ecsTaskDefinition;

    const ecsService = actionInputs[
      `resource.ecs-service-${properties.regionId}-${properties.serverKey}`
    ] as EcsService;
    ecsService.redeployWithLatestTaskDefinition();
    actionOutputs[ecsService.resourceId] = ecsService;

    return actionOutputs;
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
