import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { S3Website } from '../s3-website.resource.js';

@Action(NodeType.RESOURCE)
export class AddS3WebsiteResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3WebsiteResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node instanceof S3Website && diff.node.NODE_NAME === 's3-website';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;
    const response = s3Website.response;

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

  async mock(): Promise<void> {
    const s3Client = await Container.get(S3Client);
    s3Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateBucketCommand) {
        return;
      } else if (instance instanceof PutBucketWebsiteCommand) {
        return;
      } else if (instance instanceof PutPublicAccessBlockCommand) {
        return;
      } else if (instance instanceof PutBucketPolicyCommand) {
        return;
      }
    };
  }
}

@Factory<AddS3WebsiteResourceAction>(AddS3WebsiteResourceAction)
export class AddS3WebsiteResourceActionFactory {
  static async create(): Promise<AddS3WebsiteResourceAction> {
    return new AddS3WebsiteResourceAction();
  }
}
