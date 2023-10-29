import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../../models/region/aws.region.model.js';
import { IS3WebsiteProperties, IS3WebsiteReplicationMetadata, IS3WebsiteResponse } from '../s3-website.interface.js';
import { S3Website } from '../s3-website.resource.js';

export class AddS3WebsiteAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3WebsiteAction';

  constructor(private readonly s3Client: S3Client, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 's3-website';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.model as S3Website;
    const properties = s3Website.properties as unknown as IS3WebsiteProperties;
    const response = s3Website.response as unknown as IS3WebsiteResponse;

    // Create a new bucket.
    await this.s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );

    // Add static website hosting to the bucket.
    await this.s3Client.send(
      new PutBucketWebsiteCommand({
        Bucket: properties.Bucket,
        WebsiteConfiguration: {
          ErrorDocument: {
            Key: properties.ErrorDocument,
          },
          IndexDocument: {
            Suffix: properties.IndexDocument,
          },
        },
      }),
    );

    // Configure static website to be accessible to public.
    await this.s3Client.send(
      new PutPublicAccessBlockCommand({
        Bucket: properties.Bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          BlockPublicPolicy: false,
          IgnorePublicAcls: false,
          RestrictPublicBuckets: false,
        },
      }),
    );

    // Allow bucket files to be read by everyone.
    await this.s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: properties.Bucket,
        Policy: JSON.stringify({
          Statement: [
            {
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Principal: '*',
              Resource: [`arn:aws:s3:::${properties.Bucket}/*`],
              Sid: 'PublicReadGetObject',
            },
          ],
          Version: '2012-10-17',
        }),
      }),
    );

    // Set response.
    response.replicationsStringified = JSON.stringify({
      awsRegionId: this.region.nativeAwsRegionId,
      regionId: this.region.regionId,
    } as IS3WebsiteReplicationMetadata);
  }
}
