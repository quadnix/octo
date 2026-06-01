import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { S3StorageSchema } from '../index.schema.js';
import { S3Storage } from '../s3-storage.resource.js';

/**
 * @internal
 */
@Action(S3Storage)
export class CaptureS3StorageResponseResourceAction implements IResourceAction<S3Storage> {
  filter(diff: Diff): boolean {
    return diff.node instanceof S3Storage && hasNodeName(diff.node, 's3-storage');
  }

  async handle(_diff: Diff<S3Storage>): Promise<void> {}

  async mock(
    _diff: Diff<S3Storage>,
    capture: Partial<S3StorageSchema['response']>,
  ): Promise<S3StorageSchema['response']> {
    return {
      Arn: capture.Arn,
    };
  }
}

@Factory<CaptureS3StorageResponseResourceAction>(CaptureS3StorageResponseResourceAction)
export class CaptureS3StorageResponseResourceActionFactory {
  private static instance: CaptureS3StorageResponseResourceAction;

  static async create(): Promise<CaptureS3StorageResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureS3StorageResponseResourceAction();
    }
    return this.instance;
  }
}
