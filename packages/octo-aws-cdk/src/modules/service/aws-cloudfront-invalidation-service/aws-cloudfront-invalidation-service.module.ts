import { AModule, type AOverlay, Module, ModuleError } from '@quadnix/octo';
import { AwsCloudFrontAnchorSchema } from '../../../anchors/aws-cloudfront/aws-cloudfront.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsCloudFrontInvalidationServiceModuleSchema } from './index.schema.js';
import { AwsCloudFrontInvalidationOverlay } from './overlays/aws-cloudfront-invalidation/index.js';

/**
 * `AwsCloudFrontInvalidationServiceModule` is a CloudFront-based AWS module that drops what a distribution's
 * edges hold for one bucket, every time that bucket's files change. Without it, changed files are
 * served from the edges' old copies until those expire.
 *
 * It runs after the bucket's files are uploaded. It drops `/*`, which CloudFront bills as one path.
 * One module covers one bucket; a distribution serving several buckets takes one module per bucket.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Service, stub } from '@quadnix/octo';
 * import { AwsCloudFrontInvalidationServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-cloudfront-invalidation-service';
 *
 * octo.loadModule(AwsCloudFrontInvalidationServiceModule, 'my-invalidation-module', {
 *   cloudFront: stub<Service>('${{my-distribution-module.model.service}}'),
 *   source: stub<Service>('${{my-content-module.model.service}}'),
 * });
 * ```
 *
 * @group Modules/Service/AwsCloudFrontInvalidationService
 *
 * @reference Resources {@link CloudFrontInvalidationSchema}
 *
 * @see {@link AwsCloudFrontInvalidationServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 */
@Module<AwsCloudFrontInvalidationServiceModule>('@octo', AwsCloudFrontInvalidationServiceModuleSchema)
export class AwsCloudFrontInvalidationServiceModule extends AModule<
  AwsCloudFrontInvalidationServiceModuleSchema,
  AwsCloudFrontInvalidationOverlay
> {
  /**
   * Validates the distribution serves the bucket, and creates the overlay joining them.
   */
  async onInit(inputs: AwsCloudFrontInvalidationServiceModuleSchema): Promise<AwsCloudFrontInvalidationOverlay> {
    const { cloudFront, source } = inputs;

    // Get the distribution and the bucket.
    const [matchingCloudFrontAnchor] = await cloudFront.getAnchorsMatchingSchema(AwsCloudFrontAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const [matchingSourceAnchor] = await source.getAnchorsMatchingSchema(AwsS3StorageServiceAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { awsAccountId, distributionName } = matchingCloudFrontAnchor.getSchemaInstance().properties;
    const { bucketName, contentDigest } = matchingSourceAnchor.getSchemaInstance().properties;

    // Validate the distribution serves the bucket.
    const originOverlays = (cloudFront.getSiblings()['aws-cloudfront-s3-origin-overlay'] || []).map(
      (d) => d.to as AOverlay<any, any>,
    );
    if (!originOverlays.some((o) => o.properties.bucketName === bucketName)) {
      throw new ModuleError(
        `Bucket "${bucketName}" is not served by distribution "${distributionName}"!`,
        this.constructor.name,
      );
    }

    return new AwsCloudFrontInvalidationOverlay(
      `aws-cloudfront-invalidation-overlay-${distributionName}-${bucketName}`,
      { awsAccountId, bucketName, contentDigest, distributionName },
      [matchingCloudFrontAnchor, matchingSourceAnchor],
    );
  }
}
