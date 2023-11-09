import { IService } from '@quadnix/octo';
import { S3StorageService } from './s3-storage.service.model.js';

export interface IS3StorageService extends IService {
  awsRegionId: S3StorageService['awsRegionId'];
  bucketName: S3StorageService['bucketName'];
  directories: S3StorageService['directories'];
}
