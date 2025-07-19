import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { AlbListener } from '../alb-listener.resource.js';

/**
 * @internal
 */
@Action(AlbListener)
export class UpdateAlbListenerTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<AlbListener>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<AlbListener, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const albListener = diff.node;
    const properties = albListener.properties;
    const response = albListener.response;

    await super.handle(diff, { ...properties, resourceArn: response.ListenerArn! });
  }

  override async mock(diff: Diff<AlbListener, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const albListener = diff.node;
    const properties = albListener.properties;

    await super.mock(diff, properties);
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbListenerTagsResourceAction>(UpdateAlbListenerTagsResourceAction)
export class UpdateAlbListenerTagsResourceActionFactory {
  private static instance: UpdateAlbListenerTagsResourceAction;

  static async create(): Promise<UpdateAlbListenerTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateAlbListenerTagsResourceAction(container);
    }
    return this.instance;
  }
}
