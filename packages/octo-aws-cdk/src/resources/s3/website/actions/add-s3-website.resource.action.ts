import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IS3WebsiteProperties, IS3WebsiteResponse } from '../s3-website.interface.js';
import type { S3Website } from '../s3-website.resource.js';

@Action(ModelType.RESOURCE)
export class AddS3WebsiteResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3WebsiteResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 's3-website';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.model as S3Website;
    const properties = s3Website.properties as unknown as IS3WebsiteProperties;
    const response = s3Website.response as unknown as IS3WebsiteResponse;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Create a new bucket.
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );

    // Add static website hosting to the bucket.
    await s3Client.send(
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
    await s3Client.send(
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
    await s3Client.send(
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
    response.awsRegionId = properties.awsRegionId;
  }
}

@Factory<AddS3WebsiteResourceAction>(AddS3WebsiteResourceAction)
export class AddS3WebsiteResourceActionFactory {
  static async create(): Promise<AddS3WebsiteResourceAction> {
    return new AddS3WebsiteResourceAction();
  }
}
