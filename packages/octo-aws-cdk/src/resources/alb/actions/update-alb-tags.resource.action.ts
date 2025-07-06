import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { Alb } from '../alb.resource.js';

/**
 * @internal
 */
@Action(Alb)
export class UpdateAlbTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<Alb> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const alb = diff.node as Alb;
    const properties = alb.properties;
    const response = alb.response;

    await super.handle(diff, { ...properties, resourceArn: response.LoadBalancerArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const alb = diff.node as Alb;
    const properties = alb.properties;

    await super.mock(diff, properties);
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbTagsResourceAction>(UpdateAlbTagsResourceAction)
export class UpdateAlbTagsResourceActionFactory {
  private static instance: UpdateAlbTagsResourceAction;

  static async create(): Promise<UpdateAlbTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateAlbTagsResourceAction(container);
    }
    return this.instance;
  }
}
