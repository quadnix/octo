import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import type { S3StorageSchema } from '../index.schema.js';
import { S3Storage } from '../s3-storage.resource.js';

/**
 * @internal
 */
@Action(S3Storage)
export class UpdateS3StorageTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<S3Storage>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<S3Storage, DiffValueTypeTagUpdate>): Promise<S3StorageSchema['response']> {
    // Get properties.
    const s3Storage = diff.node;
    const properties = s3Storage.properties;
    const response = s3Storage.response;

    await super.handle(diff, { ...properties, resourceArn: response.Arn! });

    return response;
  }

  async mock(diff: Diff<S3Storage, DiffValueTypeTagUpdate>): Promise<S3StorageSchema['response']> {
    const s3Storage = diff.node;
    return s3Storage.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateS3StorageTagsResourceAction>(UpdateS3StorageTagsResourceAction)
export class UpdateS3StorageTagsResourceActionFactory {
  private static instance: UpdateS3StorageTagsResourceAction;

  static async create(): Promise<UpdateS3StorageTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateS3StorageTagsResourceAction(container);
    }
    return this.instance;
  }
}
