import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { S3Website } from '../s3-website.resource.js';

@Action(S3Website)
export class UpdateS3WebsiteTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<S3Website>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;
    const response = s3Website.response;

    await super.handle(diff, { ...properties, resourceArn: response.Arn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;

    await super.mock(diff, properties);
  }
}

@Factory<UpdateS3WebsiteTagsResourceAction>(UpdateS3WebsiteTagsResourceAction)
export class UpdateS3WebsiteTagsResourceActionFactory {
  private static instance: UpdateS3WebsiteTagsResourceAction;

  static async create(): Promise<UpdateS3WebsiteTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateS3WebsiteTagsResourceAction(container);
    }
    return this.instance;
  }
}
