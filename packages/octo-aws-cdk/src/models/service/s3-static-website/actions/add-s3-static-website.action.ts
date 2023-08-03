import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Diff, DiffAction, IAction, IActionInputRequest } from '@quadnix/octo';
import { S3StaticWebsiteService } from '../s3-static-website.service.model';

export class AddS3StaticWebsiteAction implements IAction {
  readonly ACTION_NAME: string = 'addS3StaticWebsiteAction';

  private readonly s3Client: S3Client;

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client;
  }

  collectInput(): IActionInputRequest {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  async handle(diff: Diff): Promise<void> {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    // Create a new bucket.
    await this.s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
      }),
    );

    // Add static website hosting to the bucket.
    await this.s3Client.send(
      new PutBucketWebsiteCommand({
        Bucket: bucketName,
        WebsiteConfiguration: {
          ErrorDocument: {
            Key: 'error.html',
          },
          IndexDocument: {
            Suffix: 'index.html',
          },
        },
      }),
    );

    // Configure static website to be accessible to public.
    await this.s3Client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          BlockPublicPolicy: false,
          IgnorePublicAcls: false,
          RestrictPublicBuckets: false,
        },
      }),
    );
    await this.s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify({
          Statement: [
            {
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Principal: '*',
              Resource: [`arn:aws:s3:::${bucketName}/*`],
              Sid: 'PublicReadGetObject',
            },
          ],
          Version: '2012-10-17',
        }),
      }),
    );
  }

  async revert(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
