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
import { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import type { AwsS3StorageServiceModule } from '../../../aws-s3-storage-service.module.js';
import { AwsS3StorageService } from '../aws-s3-storage-service.model.js';

/**
 * @internal
 */
@Action(AwsS3StorageService)
export class AddAwsS3StorageServiceModelAction implements IModelAction<AwsS3StorageServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsS3StorageService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    diff: Diff<AwsS3StorageService>,
    actionInputs: EnhancedModuleSchema<AwsS3StorageServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    // Create S3 Bucket.
    const s3Storage = new S3Storage(`bucket-${bucketName.replace(/[^\w-]/g, '-')}`, {
      awsAccountId,
      awsRegionId,
      Bucket: bucketName,
      permissions: [],
    });
    actionOutputs[s3Storage.resourceId] = s3Storage;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsS3StorageServiceModelAction>(AddAwsS3StorageServiceModelAction)
export class AddAwsS3StorageServiceModelActionFactory {
  private static instance: AddAwsS3StorageServiceModelAction;

  static async create(): Promise<AddAwsS3StorageServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsS3StorageServiceModelAction();
    }
    return this.instance;
  }
}
