import {
  GetBucketPolicyCommand,
  GetBucketWebsiteCommand,
  GetPublicAccessBlockCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import { S3Website } from '../s3-website.resource.js';

/**
 * @internal
 */
@Action(S3Website)
export class ValidateS3WebsiteResourceAction extends ANodeAction implements IResourceAction<S3Website> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof S3Website &&
      hasNodeName(diff.node, 's3-website') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Website>): Promise<void> {
    // Get properties.
    const s3Website = diff.node;
    const properties = s3Website.properties;
    const response = s3Website.response;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if bucket exists.
    try {
      await s3Client.send(
        new HeadBucketCommand({
          Bucket: properties.Bucket,
        }),
      );
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw new TransactionError(`S3 bucket ${properties.Bucket} does not exist!`);
      }
      throw error;
    }

    // Validate bucket ARN format.
    const expectedArn = `arn:aws:s3:::${properties.Bucket}`;
    if (response.Arn !== expectedArn) {
      throw new TransactionError(
        `S3 bucket ARN mismatch. Expected: ${expectedArn}, Actual: ${response.Arn || 'undefined'}`,
      );
    }

    // Validate website configuration.
    try {
      const websiteConfig = await s3Client.send(
        new GetBucketWebsiteCommand({
          Bucket: properties.Bucket,
        }),
      );

      if (websiteConfig.IndexDocument?.Suffix !== properties.IndexDocument) {
        throw new TransactionError(
          `S3 bucket index document mismatch. Expected: ${properties.IndexDocument}, Actual: ${websiteConfig.IndexDocument?.Suffix || 'undefined'}`,
        );
      }

      if (websiteConfig.ErrorDocument?.Key !== properties.ErrorDocument) {
        throw new TransactionError(
          `S3 bucket error document mismatch. Expected: ${properties.ErrorDocument}, Actual: ${websiteConfig.ErrorDocument?.Key || 'undefined'}`,
        );
      }
    } catch (error: any) {
      if (error.name === 'NoSuchWebsiteConfiguration') {
        throw new TransactionError(`S3 bucket ${properties.Bucket} does not have website configuration enabled!`);
      }
      throw error;
    }

    // Validate public access block configuration.
    try {
      const publicAccessBlock = await s3Client.send(
        new GetPublicAccessBlockCommand({
          Bucket: properties.Bucket,
        }),
      );

      const config = publicAccessBlock.PublicAccessBlockConfiguration;
      if (config?.BlockPublicAcls !== false) {
        throw new TransactionError(
          `S3 bucket BlockPublicAcls mismatch. Expected: false, Actual: ${config?.BlockPublicAcls}`,
        );
      }
      if (config?.BlockPublicPolicy !== false) {
        throw new TransactionError(
          `S3 bucket BlockPublicPolicy mismatch. Expected: false, Actual: ${config?.BlockPublicPolicy}`,
        );
      }
      if (config?.IgnorePublicAcls !== false) {
        throw new TransactionError(
          `S3 bucket IgnorePublicAcls mismatch. Expected: false, Actual: ${config?.IgnorePublicAcls}`,
        );
      }
      if (config?.RestrictPublicBuckets !== false) {
        throw new TransactionError(
          `S3 bucket RestrictPublicBuckets mismatch. Expected: false, Actual: ${config?.RestrictPublicBuckets}`,
        );
      }
    } catch (error: any) {
      if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
        throw new TransactionError(
          `S3 bucket ${properties.Bucket} does not have public access block configuration set!`,
        );
      }
      throw error;
    }

    // Validate bucket policy.
    try {
      const bucketPolicy = await s3Client.send(
        new GetBucketPolicyCommand({
          Bucket: properties.Bucket,
        }),
      );

      if (!bucketPolicy.Policy) {
        throw new TransactionError(`S3 bucket ${properties.Bucket} does not have a bucket policy!`);
      }

      const policy = JSON.parse(bucketPolicy.Policy);
      const expectedPolicy = {
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
      };

      // Validate policy version.
      if (policy.Version !== expectedPolicy.Version) {
        throw new TransactionError(
          `S3 bucket policy version mismatch. Expected: ${expectedPolicy.Version}, Actual: ${policy.Version}`,
        );
      }

      // Validate policy statement exists.
      const expectedStatement = expectedPolicy.Statement[0];
      const matchingStatement = policy.Statement?.find(
        (statement: any) =>
          statement.Sid === expectedStatement.Sid &&
          statement.Effect === expectedStatement.Effect &&
          statement.Principal === expectedStatement.Principal &&
          JSON.stringify(statement.Action) === JSON.stringify(expectedStatement.Action) &&
          JSON.stringify(statement.Resource) === JSON.stringify(expectedStatement.Resource),
      );

      if (!matchingStatement) {
        throw new TransactionError(
          `S3 bucket policy does not contain the expected public read statement with Sid: ${expectedStatement.Sid}`,
        );
      }
    } catch (error: any) {
      if (error.name === 'NoSuchBucketPolicy') {
        throw new TransactionError(`S3 bucket ${properties.Bucket} does not have a bucket policy!`);
      }
      throw error;
    }

    // Validate region ID matches response.
    if (response.awsRegionId !== properties.awsRegionId) {
      throw new TransactionError(
        `S3 bucket region mismatch. Expected: ${properties.awsRegionId}, Actual: ${response.awsRegionId || 'undefined'}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateS3WebsiteResourceAction>(ValidateS3WebsiteResourceAction)
export class ValidateS3WebsiteResourceActionFactory {
  private static instance: ValidateS3WebsiteResourceAction;

  static async create(): Promise<ValidateS3WebsiteResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateS3WebsiteResourceAction();
    }
    return this.instance;
  }
}
