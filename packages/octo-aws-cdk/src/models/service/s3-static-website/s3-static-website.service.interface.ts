import type { IService } from '@quadnix/octo';
import type { S3StaticWebsiteService } from './s3-static-website.service.model.js';

export interface IS3StaticWebsiteService extends IService {
  awsRegionId: S3StaticWebsiteService['awsRegionId'];
  bucketName: S3StaticWebsiteService['bucketName'];
  excludePaths: S3StaticWebsiteService['excludePaths'];
  sourcePaths: S3StaticWebsiteService['sourcePaths'];
}
