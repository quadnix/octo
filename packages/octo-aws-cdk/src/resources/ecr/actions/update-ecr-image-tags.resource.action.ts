import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { EcrImage } from '../ecr-image.resource.js';

/**
 * @internal
 */
@Action(EcrImage)
export class UpdateEcrImageTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<EcrImage>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<EcrImage, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const ecr = diff.node;
    const properties = ecr.properties;
    const response = ecr.response;

    await super.handle(diff, { ...properties, resourceArn: response.repositoryArn! });
  }

  override async mock(diff: Diff<EcrImage, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const ecr = diff.node;
    const properties = ecr.properties;

    await super.mock(diff, properties);
  }
}

/**
 * @internal
 */
@Factory<UpdateEcrImageTagsResourceAction>(UpdateEcrImageTagsResourceAction)
export class UpdateEcrImageTagsResourceActionFactory {
  private static instance: UpdateEcrImageTagsResourceAction;

  static async create(): Promise<UpdateEcrImageTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEcrImageTagsResourceAction(container);
    }
    return this.instance;
  }
}
