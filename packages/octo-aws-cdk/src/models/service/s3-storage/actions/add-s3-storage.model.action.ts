import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource.js';
import { S3StorageService } from '../s3-storage.service.model.js';

@Action(NodeType.MODEL)
export class AddS3StorageModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddS3StorageModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3StorageService &&
      diff.node.NODE_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const { awsRegionId, bucketName } = diff.node as S3StorageService;

    // Create S3 Bucket.
    const s3Storage = new S3Storage(`bucket-${bucketName}`, {
      awsRegionId,
      Bucket: bucketName,
    });
    actionOutputs[s3Storage.resourceId] = s3Storage;

    return actionOutputs;
  }
}

@Factory<AddS3StorageModelAction>(AddS3StorageModelAction)
export class AddS3StorageModelActionFactory {
  static async create(): Promise<AddS3StorageModelAction> {
    return new AddS3StorageModelAction();
  }
}
