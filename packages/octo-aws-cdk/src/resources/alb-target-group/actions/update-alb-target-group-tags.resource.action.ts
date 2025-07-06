import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { AlbTargetGroup } from '../alb-target-group.resource.js';

/**
 * @internal
 */
@Action(AlbTargetGroup)
export class UpdateAlbTargetGroupTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<AlbTargetGroup>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const albTargetGroup = diff.node as AlbTargetGroup;
    const properties = albTargetGroup.properties;
    const response = albTargetGroup.response;

    await super.handle(diff, { ...properties, resourceArn: response.TargetGroupArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const albTargetGroup = diff.node as AlbTargetGroup;
    const properties = albTargetGroup.properties;

    await super.mock(diff, properties);
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbTargetGroupTagsResourceAction>(UpdateAlbTargetGroupTagsResourceAction)
export class UpdateAlbTargetGroupTagsResourceActionFactory {
  private static instance: UpdateAlbTargetGroupTagsResourceAction;

  static async create(): Promise<UpdateAlbTargetGroupTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateAlbTargetGroupTagsResourceAction(container);
    }
    return this.instance;
  }
}
