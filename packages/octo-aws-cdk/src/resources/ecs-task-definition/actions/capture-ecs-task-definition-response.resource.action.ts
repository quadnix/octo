import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';
import type { EcsTaskDefinitionSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsTaskDefinition)
export class CaptureEcsTaskDefinitionResponseResourceAction implements IResourceAction<EcsTaskDefinition> {
  filter(diff: Diff): boolean {
    return diff.node instanceof EcsTaskDefinition && hasNodeName(diff.node, 'ecs-task-definition');
  }

  async handle(_diff: Diff<EcsTaskDefinition>): Promise<void> {}

  async mock(
    _diff: Diff<EcsTaskDefinition>,
    capture: Partial<EcsTaskDefinitionSchema['response']>,
  ): Promise<EcsTaskDefinitionSchema['response']> {
    return {
      revision: capture.revision,
      taskDefinitionArn: capture.taskDefinitionArn,
    };
  }
}

@Factory<CaptureEcsTaskDefinitionResponseResourceAction>(CaptureEcsTaskDefinitionResponseResourceAction)
export class CaptureEcsTaskDefinitionResponseResourceActionFactory {
  private static instance: CaptureEcsTaskDefinitionResponseResourceAction;

  static async create(): Promise<CaptureEcsTaskDefinitionResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureEcsTaskDefinitionResponseResourceAction();
    }
    return this.instance;
  }
}
