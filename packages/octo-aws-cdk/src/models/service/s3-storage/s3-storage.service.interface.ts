import { IService } from '@quadnix/octo';
import { IModelReference } from '@quadnix/octo/dist/models/model.interface';
import { S3StorageService } from './s3-storage.service.model';

export interface IS3StorageService extends IService {
  bucketName: S3StorageService['bucketName'];
  directories: S3StorageService['directories'];
  region: IModelReference;
}
