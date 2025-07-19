import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { EcsService } from '../ecs-service.resource.js';

/**
 * @internal
 */
@Action(EcsService)
export class UpdateEcsServiceTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<EcsService>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<EcsService, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const ecsService = diff.node;
    const properties = ecsService.properties;
    const response = ecsService.response;

    await super.handle(diff, { ...properties, resourceArn: response.serviceArn! });
  }

  override async mock(diff: Diff<EcsService, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const ecsService = diff.node;
    const properties = ecsService.properties;

    await super.mock(diff, properties);
  }
}

/**
 * @internal
 */
@Factory<UpdateEcsServiceTagsResourceAction>(UpdateEcsServiceTagsResourceAction)
export class UpdateEcsServiceTagsResourceActionFactory {
  private static instance: UpdateEcsServiceTagsResourceAction;

  static async create(): Promise<UpdateEcsServiceTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEcsServiceTagsResourceAction(container);
    }
    return this.instance;
  }
}
