import { EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import { IAction } from '@quadnix/octo';
import { AddImageAction } from './models/image/actions/add-image.action';
import { AddRegionAction } from './models/region/actions/add-region.action';
import { AwsRegion } from './models/region/aws.region.model';
import { AddS3StaticWebsiteAction } from './models/service/s3-static-website/actions/add-s3-static-website.action';
import { DeleteS3StaticWebsiteAction } from './models/service/s3-static-website/actions/delete-s3-static-website.action';
import { UpdateSourcePathsS3StaticWebsiteAction } from './models/service/s3-static-website/actions/update-source-paths-s3-static-website.action';

export { AwsRegion, AWSRegionId } from './models/region/aws.region.model';
export { IS3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.interface';
export { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model';

export class OctoAws {
  private readonly region: AwsRegion;

  private readonly ec2Client: EC2Client;
  private readonly ecrClient: ECRClient;
  private readonly s3Client: S3Client;
  private readonly stsClient: STSClient;

  constructor(region: AwsRegion) {
    this.region = region;

    this.ec2Client = new EC2Client({ region: region.nativeAwsRegionId });

    this.ecrClient = new ECRClient({ region: region.nativeAwsRegionId });

    this.s3Client = new S3Client({ region: region.nativeAwsRegionId });

    this.stsClient = new STSClient({ region: region.nativeAwsRegionId });
  }

  getImageActions(): IAction[] {
    const addImageAction = new AddImageAction(this.ecrClient);
    return [addImageAction];
  }

  getRegionActions(): IAction[] {
    const addRegionAction = new AddRegionAction(this.ec2Client);
    return [addRegionAction];
  }

  getS3StaticWebsiteActions(): IAction[] {
    const addWebsiteAction = new AddS3StaticWebsiteAction(this.s3Client);
    const deleteWebsiteAction = new DeleteS3StaticWebsiteAction(this.s3Client);
    const updateSourcePathAction = new UpdateSourcePathsS3StaticWebsiteAction(this.s3Client);
    return [addWebsiteAction, deleteWebsiteAction, updateSourcePathAction];
  }
}
