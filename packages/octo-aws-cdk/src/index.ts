import { ECRClient } from '@aws-sdk/client-ecr';
import { S3Client } from '@aws-sdk/client-s3';
import { IAction } from '@quadnix/octo';
import { AddImageAction } from './models/image/actions/add-image.action';
import { AddS3StaticWebsiteAction } from './models/service/actions/s3-static-website/add-s3-static-website.action';
import { DeleteS3StaticWebsiteAction } from './models/service/actions/s3-static-website/delete-s3-static-website.action';
import { UpdateSourcePathsS3StaticWebsiteAction } from './models/service/actions/s3-static-website/update-source-paths-s3-static-website.action';

export class OctoAws {
  private readonly ecrClient: ECRClient;
  private readonly s3Client: S3Client;

  constructor(region: string) {
    this.ecrClient = new ECRClient({ region });
    this.s3Client = new S3Client({ region });
  }

  getImageActions(): IAction[] {
    const addImageAction = new AddImageAction(this.ecrClient);
    return [addImageAction];
  }

  getS3StaticWebsiteActions(): IAction[] {
    const addWebsiteAction = new AddS3StaticWebsiteAction(this.s3Client);
    const deleteWebsiteAction = new DeleteS3StaticWebsiteAction(this.s3Client);
    const updateSourcePathAction = new UpdateSourcePathsS3StaticWebsiteAction(this.s3Client);
    return [addWebsiteAction, deleteWebsiteAction, updateSourcePathAction];
  }
}
