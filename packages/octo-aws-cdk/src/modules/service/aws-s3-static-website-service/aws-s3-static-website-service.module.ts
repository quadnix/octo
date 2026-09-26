import { AModule, type App, Module, ModuleError } from '@quadnix/octo';
import { AwsS3StaticWebsiteServiceModuleSchema } from './index.schema.js';
import { AwsS3StaticWebsiteService } from './models/service/index.js';

/**
 * `AwsS3StaticWebsiteServiceModule` is an S3-based AWS static website service module
 * that provides an implementation for the `Service` model.
 * This module creates S3 buckets configured for static website hosting with support for local file synchronization,
 * filtering, and transformation capabilities.
 * It manages the deployment of static websites from local directories to S3.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Account, stub } from '@quadnix/octo';
 * import {
 *   AwsS3StaticWebsiteServiceModule
 * } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
 *
 * octo.loadModule(AwsS3StaticWebsiteServiceModule, 'my-website-module', {
 *   account: stub<Account>('${{my-account-module.model.account}}'),
 *   awsRegionId: 'us-east-1',
 *   bucketName: 'my-static-website',
 *   cloudFront: {
 *     aliases: ['www.example.com'],
 *     certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
 *   },
 *   directoryPath: 'website',
 *   filter: (filePath) => !filePath.includes('.DS_Store'),
 * });
 * ```
 *
 * @group Modules/Service/AwsS3StaticWebsiteService
 *
 * @reference Resources {@link CloudFrontDistributionSchema}
 * @reference Resources {@link CloudFrontInvalidationSchema}
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
    const { app } = await this.registerMetadata(inputs);

    // Validate the distribution can serve the domains it answers on.
    if (inputs.cloudFront?.aliases?.length && !inputs.cloudFront.certificateArn) {
      throw new ModuleError('A CloudFront certificate is required to serve an alias!', this.constructor.name);
    }

    // Create a new s3-website service.
    const s3StaticWebsiteService = new AwsS3StaticWebsiteService(inputs.bucketName);
    app.addService(s3StaticWebsiteService);

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
   * Resolves the app, account, and region this bucket is created in.
   */
  override async registerMetadata(
    inputs: AwsS3StaticWebsiteServiceModuleSchema,
  ): Promise<{ app: App; awsAccountId: string; awsRegionId: string }> {
    const account = inputs.account;
    const app = account.getParents()['app'][0].to as App;

    return {
      app,
      awsAccountId: account.accountId,
      awsRegionId: inputs.awsRegionId,
    };
  }
}
