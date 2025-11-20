import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { AlbTargetGroup } from '../alb-target-group.resource.js';
import type { AlbTargetGroupSchema } from '../index.schema.js';

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

  override async handle(diff: Diff<AlbTargetGroup, DiffValueTypeTagUpdate>): Promise<AlbTargetGroupSchema['response']> {
    // Get properties.
    const albTargetGroup = diff.node;
    const properties = albTargetGroup.properties;
    const response = albTargetGroup.response;

    await super.handle(diff, { ...properties, resourceArn: response.TargetGroupArn! });

    return response;
  }

  async mock(diff: Diff<AlbTargetGroup, DiffValueTypeTagUpdate>): Promise<AlbTargetGroupSchema['response']> {
    const albTargetGroup = diff.node;
    return albTargetGroup.response;
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
