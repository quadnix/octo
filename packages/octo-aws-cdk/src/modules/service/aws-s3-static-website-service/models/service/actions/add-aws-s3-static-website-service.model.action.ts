import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  hasNodeName,
} from '@quadnix/octo';
import { CloudFrontDistribution } from '../../../../../../resources/cloudfront-distribution/index.js';
import { CloudFrontInvalidation } from '../../../../../../resources/cloudfront-invalidation/index.js';
import { S3Website } from '../../../../../../resources/s3-website/index.js';
import type { AwsS3StaticWebsiteServiceModule } from '../../../aws-s3-static-website-service.module.js';
import { AwsS3StaticWebsiteService } from '../aws-s3-static-website-service.model.js';

/**
 * @internal
 */
@Action(AwsS3StaticWebsiteService)
export class AddAwsS3StaticWebsiteServiceModelAction implements IModelAction<AwsS3StaticWebsiteServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsS3StaticWebsiteService>,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;
    const { cloudFront } = actionInputs.inputs;

    const errorDocument = 'error.html';
    const indexDocument = 'index.html';
    const sanitizedBucketName = bucketName.replace(/[^\w-]/g, '-');

    // Create S3 Website.
    const s3Website = new S3Website(`bucket-${sanitizedBucketName}`, {
      awsAccountId,
      awsRegionId,
      Bucket: bucketName,
      // Filled in by the grant below, which is also what closes the bucket.
      distributionResourceIds: [],
      ErrorDocument: errorDocument,
      IndexDocument: indexDocument,
    });

    actionOutputs[s3Website.resourceId] = s3Website;

    if (!cloudFront) {
      return actionOutputs;
    }

    const originId = `${sanitizedBucketName}-origin`;

    // Create CloudFront Distribution. This is one website-shaped setup out of what the resource can
    // express: a single private bucket, everything cached the same way, and misses answered
    // according to whether the site routes on the client or on the server.
    const cloudFrontDistribution = new CloudFrontDistribution(`cloudfront-${sanitizedBucketName}`, {
      aliases: [...(cloudFront.aliases || [])],
      awsAccountId,
      behaviors: [
        {
          allowedMethods: ['GET', 'HEAD'],
          cachedMethods: ['GET', 'HEAD'],
          cachePolicy: { kind: 'managed', name: 'Managed-CachingOptimized' },
          compress: true,
          functionAssociations: [],
          originRequestPolicy: null,
          pathPattern: null,
          responseHeadersPolicy: null,
          targetOriginId: originId,
          viewerProtocolPolicy: 'redirect-to-https',
        },
      ],
      cachePolicies: [],
      comment: cloudFront.aliases?.[0] || bucketName,
      customErrorResponses: [403, 404].map((errorCode) =>
        cloudFront.notFoundBehavior === 'single-page-app'
          ? {
              // A short TTL, because what is missing today is the app's next route tomorrow.
              errorCachingMinTtl: 10,
              errorCode,
              responseCode: 200,
              responsePagePath: `/${indexDocument}`,
            }
          : { errorCachingMinTtl: 10, errorCode, responseCode: 404, responsePagePath: `/${errorDocument}` },
      ),
      defaultRootObject: indexDocument,
      distributionName: sanitizedBucketName,
      enabled: true,
      geoRestriction: { kind: 'none' },
      httpVersion: 'http2and3',
      isIpv6Enabled: true,
      logging: null,
      originGroups: [],
      originRequestPolicies: [],
      origins: [
        {
          connectionAttempts: 3,
          connectionTimeout: 10,
          customHeaders: {},
          kind: { bucketName, bucketRegion: awsRegionId, kind: 's3' },
          originId,
          originPath: '',
        },
      ],
      priceClass: cloudFront.priceClass || 'PriceClass_All',
      responseHeadersPolicies: [],
      viewerCertificate: cloudFront.certificateArn
        ? {
            certificateArn: cloudFront.certificateArn,
            kind: 'acm',
            // eslint-disable-next-line spellcheck/spell-checker
            minimumProtocolVersion: 'TLSv1.2_2021',
          }
        : { kind: 'default' },
      webAclArn: cloudFront.webAclArn || null,
    });

    actionOutputs[cloudFrontDistribution.resourceId] = cloudFrontDistribution;

    // Admit the distribution to the bucket. The grant lives on the bucket, in the one policy the
    // bucket owns, so a second distribution in front of the same bucket would add a statement rather
    // than overwrite this one. It also closes the bucket: a bucket with a distribution in front of it
    // publishes nothing of its own.
    const matchingCloudFrontDistribution = new MatchingResource(cloudFrontDistribution);
    s3Website.addCloudFrontAccess(matchingCloudFrontDistribution);

    // Drop what the edges are holding whenever the published files change. The version is a
    // placeholder until the source paths are read, which happens in the same transaction.
    const cloudFrontInvalidation = new CloudFrontInvalidation(
      `cloudfront-invalidation-${sanitizedBucketName}`,
      { awsAccountId, contentVersion: 'initial', paths: ['/*'] },
      [matchingCloudFrontDistribution],
    );

    actionOutputs[cloudFrontInvalidation.resourceId] = cloudFrontInvalidation;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsS3StaticWebsiteServiceModelAction>(AddAwsS3StaticWebsiteServiceModelAction)
export class AddAwsS3StaticWebsiteServiceModelActionFactory {
  private static instance: AddAwsS3StaticWebsiteServiceModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsS3StaticWebsiteServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsS3StaticWebsiteServiceModelAction();
    }
    return this.instance;
  }
}
