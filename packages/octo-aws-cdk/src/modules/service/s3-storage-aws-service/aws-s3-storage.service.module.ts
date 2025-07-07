import { AModule, type Account, type App, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { S3StorageAnchor } from '../../../anchors/s3-storage/s3-storage.anchor.js';
import { AwsS3StorageServiceModuleSchema } from './index.schema.js';
import { AwsS3StorageService } from './models/s3-storage/index.js';

/**
 * @group Modules/Service/S3StorageAwsService
 */
@Module<AwsS3StorageServiceModule>('@octo', AwsS3StorageServiceModuleSchema)
export class AwsS3StorageServiceModule extends AModule<AwsS3StorageServiceModuleSchema, AwsS3StorageService> {
  async onInit(inputs: AwsS3StorageServiceModuleSchema): Promise<AwsS3StorageService> {
    const { app, awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new s3-storage service.
    const s3StorageService = new AwsS3StorageService(inputs.bucketName);
    app.addService(s3StorageService);

    // Add anchors.
    const s3StorageAnchor = new S3StorageAnchor(
      'S3StorageAnchor',
      { awsAccountId, awsRegionId, bucketName: inputs.bucketName },
      s3StorageService,
    );
    s3StorageService.addAnchor(s3StorageAnchor);
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
