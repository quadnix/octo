import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import type { S3WebsiteSchema } from '../index.schema.js';
import { S3Website } from '../s3-website.resource.js';

/**
 * @internal
 */
@Action(S3Website)
export class AddS3WebsiteResourceAction implements IResourceAction<S3Website> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3Website &&
      hasNodeName(diff.node, 's3-website') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Website>): Promise<S3WebsiteSchema['response']> {
    // Get properties.
    const s3Website = diff.node;
    const properties = s3Website.properties;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

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
              Sid: PolicyUtility.getSafeSid('PublicReadGetObject'),
            },
          ],
          Version: '2012-10-17',
        }),
      }),
    );

    return {
      Arn: `arn:aws:s3:::${properties.Bucket}`,
      awsRegionId: properties.awsRegionId,
    };
  }

  async mock(diff: Diff<S3Website>): Promise<S3WebsiteSchema['response']> {
    // Get properties.
    const s3Website = diff.node;
    const properties = s3Website.properties;

    return {
      Arn: `arn:aws:s3:::${properties.Bucket}`,
      awsRegionId: properties.awsRegionId,
    };
  }
}

/**
 * @internal
 */
@Factory<AddS3WebsiteResourceAction>(AddS3WebsiteResourceAction)
export class AddS3WebsiteResourceActionFactory {
  private static instance: AddS3WebsiteResourceAction;

  static async create(): Promise<AddS3WebsiteResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddS3WebsiteResourceAction(container);
    }
    return this.instance;
  }
}
