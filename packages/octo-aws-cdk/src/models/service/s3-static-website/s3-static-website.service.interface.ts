import { IModelReference, IService } from '@quadnix/octo';
import { S3StaticWebsiteService } from './s3-static-website.service.model.js';

export interface IS3StaticWebsiteService extends IService {
  bucketName: S3StaticWebsiteService['bucketName'];
  excludePaths: S3StaticWebsiteService['excludePaths'];
  region: IModelReference;
  sourcePaths: S3StaticWebsiteService['sourcePaths'];
}
