import { ECRClient } from '@aws-sdk/client-ecr';
import { S3Client } from '@aws-sdk/client-s3';
import { IAction } from '@quadnix/octo';
import { AddS3StaticWebsiteAction } from './models/service/actions/s3-static-website/add-s3-static-website.action';
import { UpdateSourcePathsS3StaticWebsiteAction } from './models/service/actions/s3-static-website/update-source-paths-s3-static-website.action';

export class OctoAws {
  private readonly ecrClient: ECRClient;
  private readonly s3Client: S3Client;

  constructor(region: string) {
    this.ecrClient = new ECRClient({ region });
    this.s3Client = new S3Client({ region });
  }

  getS3StaticWebsiteActions(): IAction[] {
    const addAction = new AddS3StaticWebsiteAction(this.s3Client);
    const updateAction = new UpdateSourcePathsS3StaticWebsiteAction(this.s3Client);
    return [addAction, updateAction];
  }
}
