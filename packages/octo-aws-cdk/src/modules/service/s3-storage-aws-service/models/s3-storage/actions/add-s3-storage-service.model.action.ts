import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import type { AwsS3StorageServiceModule } from '../../../aws-s3-storage.service.module.js';
import { AwsS3StorageService } from '../aws-s3-storage.service.model.js';

@Action(AwsS3StorageService)
export class AddS3StorageServiceModelAction implements IModelAction<AwsS3StorageServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsS3StorageService &&
      (diff.node.constructor as typeof AwsS3StorageService).NODE_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsS3StorageServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node as AwsS3StorageService;

    const { awsAccountId, awsRegionId } = actionInputs.metadata as Awaited<
      ReturnType<AwsS3StorageServiceModule['registerMetadata']>
    >;

    // Create S3 Bucket.
    const s3Storage = new S3Storage(`bucket-${bucketName}`, {
      awsAccountId,
      awsRegionId,
      Bucket: bucketName,
    });
    actionOutputs[s3Storage.resourceId] = s3Storage;

    return actionOutputs;
  }
}

@Factory<AddS3StorageServiceModelAction>(AddS3StorageServiceModelAction)
export class AddS3StorageServiceModelActionFactory {
  private static instance: AddS3StorageServiceModelAction;

  static async create(): Promise<AddS3StorageServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddS3StorageServiceModelAction();
    }
    return this.instance;
  }
}
