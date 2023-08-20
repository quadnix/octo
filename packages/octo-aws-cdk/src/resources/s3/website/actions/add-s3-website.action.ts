import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IS3WebsiteProperties } from '../s3-website.interface';
import { S3Website } from '../s3-website.resource';

export class AddS3WebsiteAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3WebsiteAction';

  constructor(private readonly s3Client: S3Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 's3-website';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.model as S3Website;
    const properties = s3Website.properties as unknown as IS3WebsiteProperties;

    // Create a new bucket.
    await this.s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );

    await Promise.all([
      // Add static website hosting to the bucket.
      this.s3Client.send(
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
      ),

      // Configure static website to be accessible to public.
      this.s3Client.send(
        new PutPublicAccessBlockCommand({
          Bucket: properties.Bucket,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: false,
            BlockPublicPolicy: false,
            IgnorePublicAcls: false,
            RestrictPublicBuckets: false,
          },
        }),
      ),

      // Allow bucket files to be read by everyone.
      this.s3Client.send(
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
      ),
    ]);
  }
}
