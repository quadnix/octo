import { AModule, type Account, Module, ModuleError } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsS3StorageServiceAnchor } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.js';
import { AwsS3StorageServiceModuleSchema } from './index.schema.js';
import { AwsS3StorageService } from './models/service/index.js';

/**
 * `AwsS3StorageServiceModule` is an S3-based AWS storage service module
 * that provides an implementation for the `Service` model.
 * This module creates an S3 bucket for object storage, declares the key prefixes in it that other
 * modules may be granted access to, and optionally uploads the files of a local directory into it.
 *
 * The bucket is closed to the public by default. To serve its files, pass it as an origin to
 * `AwsCloudFrontServiceModule`, which grants its distribution access. For a bucket that serves a
 * website on its own, use `AwsS3StaticWebsiteServiceModule`.
 * The bucket lives in a region created by any of the AWS region modules.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import { AwsS3StorageServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-storage-service';
 *
 * octo.loadModule(AwsS3StorageServiceModule, 'my-storage-module', {
 *   accessPrefixes: ['uploads', 'documents', 'images'],
 *   bucketName: 'my-app-storage',
 *   directoryPath: 'website',
 *   filter: (filePath) => !filePath.includes('.DS_Store'),
 *   region: stub<Region>('${{my-region-module.model.region}}')
 * });
 * ```
 *
 * @group Modules/Service/AwsS3StorageService
 *
 * @reference Resources {@link S3StorageSchema}
 *
 * @see {@link AwsS3StorageServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Service](/api/octo/class/Service) to learn more about the `Service` model.
 */
@Module<AwsS3StorageServiceModule>('@octo', AwsS3StorageServiceModuleSchema)
export class AwsS3StorageServiceModule extends AModule<AwsS3StorageServiceModuleSchema, AwsS3StorageService> {
  /**
   * Creates the bucket service, registers the local files it uploads, and registers each access
   * prefix in it that other modules may be granted access to.
   */
  async onInit(inputs: AwsS3StorageServiceModuleSchema): Promise<AwsS3StorageService> {
    const { awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new s3-storage service.
    const s3StorageService = new AwsS3StorageService(inputs.bucketName, inputs.region);

    // Add source files.
    if (inputs.directoryPath) {
      await s3StorageService.addSource(
        inputs.directoryPath,
        inputs.subDirectoryOrFilePath || undefined,
        inputs.filter || undefined,
        inputs.transform || undefined,
      );
    }

    // Add anchors.
    s3StorageService.addAnchor(
      new AwsS3StorageServiceAnchor(
        'AwsS3StorageServiceAnchor',
        {
          awsAccountId,
          awsRegionId,
          bucketName: inputs.bucketName,
          contentDigest: await s3StorageService.getContentDigest(),
        },
        s3StorageService,
      ),
    );
    // Add access prefixes.
    for (const accessPrefix of inputs.accessPrefixes || []) {
      s3StorageService.addAccessPrefix(accessPrefix);
    }

    return s3StorageService;
  }

  /**
   * Resolves the account and region this bucket is created in.
   * The region may be networked or serverless; the bucket only needs its AWS region ID.
   */
  override async registerMetadata(
    inputs: AwsS3StorageServiceModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [[matchingRegionAnchor], [matchingServerlessRegionAnchor]] = await Promise.all([
      region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], { searchBoundaryMembers: false }),
      region.getAnchorsMatchingSchema(AwsServerlessRegionAnchorSchema, [], { searchBoundaryMembers: false }),
    ]);
    const matchingAnchor = matchingRegionAnchor || matchingServerlessRegionAnchor;
    if (!matchingAnchor) {
      throw new ModuleError('Region is not an AWS region!', this.constructor.name);
    }
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
