import { IService } from '@quadnix/octo';
import { S3StaticWebsiteService } from './s3-static-website.service.model';

export interface IS3StaticWebsiteService extends IService {
  bucketName: S3StaticWebsiteService['bucketName'];
  excludePaths: S3StaticWebsiteService['excludePaths'];
  sourcePaths: S3StaticWebsiteService['sourcePaths'];
}
