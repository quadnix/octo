import { AModule, type Account, Module } from '@quadnix/octo';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsS3StaticWebsiteServiceModuleSchema } from './index.schema.js';
import { AwsS3StaticWebsiteService } from './models/service/index.js';

/**
 * `AwsS3StaticWebsiteServiceModule` is an S3-based AWS static website service module
 * that provides an implementation for the `Service` model.
 * This module creates S3 buckets configured for static website hosting with support for local file synchronization,
 * filtering, and transformation capabilities.
 * It manages the deployment of static websites from local directories to S3.
 *
 * The bucket is public and served over plain HTTP on its S3 website endpoint. It lives in a region
 * created by `AwsServerlessRegionModule`. To serve files through CloudFront instead, use
 * `AwsS3StorageServiceModule`, whose bucket is closed and fronted by `AwsCloudFrontServiceModule`.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import {
 *   AwsS3StaticWebsiteServiceModule
 * } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
 *
 * octo.loadModule(AwsS3StaticWebsiteServiceModule, 'my-website-module', {
 *   bucketName: 'my-static-website',
 *   directoryPath: 'website',
 *   filter: (filePath) => !filePath.includes('.DS_Store'),
 *   region: stub<Region>('${{my-region-module.model.region}}'),
 * });
 * ```
 *
 * @group Modules/Service/AwsS3StaticWebsiteService
 *
 * @reference Resources {@link S3WebsiteSchema}
 *
 * @see {@link AwsS3StaticWebsiteServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Service](/api/octo/class/Service) to learn more about the `Service` model.
 */
@Module<AwsS3StaticWebsiteServiceModule>('@octo', AwsS3StaticWebsiteServiceModuleSchema)
export class AwsS3StaticWebsiteServiceModule extends AModule<
  AwsS3StaticWebsiteServiceModuleSchema,
  AwsS3StaticWebsiteService
> {
  /**
   * Creates the bucket service, and registers the local directory whose files it serves.
   */
  async onInit(inputs: AwsS3StaticWebsiteServiceModuleSchema): Promise<AwsS3StaticWebsiteService> {
    // Create a new s3-website service.
    const s3StaticWebsiteService = new AwsS3StaticWebsiteService(inputs.bucketName, inputs.region);

    // Add website source.
    await s3StaticWebsiteService.addSource(
      inputs.directoryPath,
      inputs.subDirectoryOrFilePath || undefined,
      inputs.filter || undefined,
      inputs.transform || undefined,
    );

    return s3StaticWebsiteService;
  }

  /**
   * Resolves the account and region this bucket is created in.
   */
  override async registerMetadata(
    inputs: AwsS3StaticWebsiteServiceModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsServerlessRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
