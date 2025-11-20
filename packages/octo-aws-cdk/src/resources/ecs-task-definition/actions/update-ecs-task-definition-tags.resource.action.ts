import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';
import type { EcsTaskDefinitionSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsTaskDefinition)
export class UpdateEcsTaskDefinitionTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<EcsTaskDefinition>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(
    diff: Diff<EcsTaskDefinition, DiffValueTypeTagUpdate>,
  ): Promise<EcsTaskDefinitionSchema['response']> {
    // Get properties.
    const ecsTaskDefinition = diff.node;
    const properties = ecsTaskDefinition.properties;
    const response = ecsTaskDefinition.response;

    await super.handle(diff, { ...properties, resourceArn: response.taskDefinitionArn! });

    return response;
  }

  async mock(diff: Diff<EcsTaskDefinition, DiffValueTypeTagUpdate>): Promise<EcsTaskDefinitionSchema['response']> {
    const ecsTaskDefinition = diff.node;
    return ecsTaskDefinition.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateEcsTaskDefinitionTagsResourceAction>(UpdateEcsTaskDefinitionTagsResourceAction)
export class UpdateEcsTaskDefinitionTagsResourceActionFactory {
  private static instance: UpdateEcsTaskDefinitionTagsResourceAction;

  static async create(): Promise<UpdateEcsTaskDefinitionTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEcsTaskDefinitionTagsResourceAction(container);
    }
    return this.instance;
  }
}
