import { AModule, type Account, type App, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsS3StorageServiceAnchor } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.js';
import { AwsS3StorageServiceModuleSchema } from './index.schema.js';
import { AwsS3StorageService } from './models/service/index.js';

/**
 * `AwsS3StorageServiceModule` is an S3-based AWS storage service module
 * that provides an implementation for the `Service` model.
 * This module creates S3 buckets for object storage with support for directory organization and remote file management.
 * It provides scalable, durable storage for applications with configurable directory structures.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsS3StorageServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-storage-service';
 *
 * octo.loadModule(AwsS3StorageServiceModule, 'my-storage-module', {
 *   bucketName: 'my-app-storage',
 *   region: myRegion,
 *   remoteDirectoryPaths: ['uploads', 'documents', 'images']
 * });
 * ```
 *
 * @group Modules/Service/AwsS3StorageService
 *
 * @reference Resources {@link S3StorageSchema}
 *
 * @see {@link AwsS3StorageServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Service} to learn more about the `Service` model.
 */
@Module<AwsS3StorageServiceModule>('@octo', AwsS3StorageServiceModuleSchema)
export class AwsS3StorageServiceModule extends AModule<AwsS3StorageServiceModuleSchema, AwsS3StorageService> {
  async onInit(inputs: AwsS3StorageServiceModuleSchema): Promise<AwsS3StorageService> {
    const { app, awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new service service.
    const s3StorageService = new AwsS3StorageService(inputs.bucketName);
    app.addService(s3StorageService);

    // Add anchors.
    s3StorageService.addAnchor(
      new AwsS3StorageServiceAnchor(
        'AwsS3StorageServiceAnchor',
        { awsAccountId, awsRegionId, bucketName: inputs.bucketName },
        s3StorageService,
      ),
    );
    // Add S3 directories.
    for (const remoteDirectoryPath of inputs.remoteDirectoryPaths || []) {
      s3StorageService.addDirectory(remoteDirectoryPath);
    }

    return s3StorageService;
  }

  override async registerMetadata(
    inputs: AwsS3StorageServiceModuleSchema,
  ): Promise<{ app: App; awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      app,
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
