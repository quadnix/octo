import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import type { IManifest } from '../../../../../../utilities/s3-file-source/s3-file-source.utility.js';
import type { AwsS3StorageServiceModule } from '../../../aws-s3-storage-service.module.js';
import { AwsS3StorageService } from '../aws-s3-storage-service.model.js';

/**
 * @internal
 */
@Action(AwsS3StorageService)
export class UpdateAwsS3StorageServiceSourcePathsModelAction implements IModelAction<AwsS3StorageServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AwsS3StorageService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'sourcePaths'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsS3StorageService, IManifest>,
    actionInputs: EnhancedModuleSchema<AwsS3StorageServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;
    const sanitizedBucketName = bucketName.replace(/[^\w-]/g, '-');

    const s3Storage = actionInputs.resources[`bucket-${sanitizedBucketName}`] as S3Storage;
    s3Storage.updateManifest(diff.value);

    actionOutputs[s3Storage.resourceId] = s3Storage;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<UpdateAwsS3StorageServiceSourcePathsModelAction>(UpdateAwsS3StorageServiceSourcePathsModelAction)
export class UpdateAwsS3StorageServiceSourcePathsModelActionFactory {
  private static instance: UpdateAwsS3StorageServiceSourcePathsModelAction;

  /**
   * @internal
   */
  static async create(): Promise<UpdateAwsS3StorageServiceSourcePathsModelAction> {
    if (!this.instance) {
      this.instance = new UpdateAwsS3StorageServiceSourcePathsModelAction();
    }
    return this.instance;
  }
}
