import { S3Client } from '@aws-sdk/client-s3';
import { AModule, type Account, type App, Container, ContainerRegistrationError, Module } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { S3StorageAnchor } from '../../../anchors/s3-storage/s3-storage.anchor.js';
import { AwsS3StorageServiceModuleSchema } from './index.schema.js';
import { AwsS3StorageService } from './models/s3-storage/index.js';

@Module<AwsS3StorageServiceModule>('@octo', AwsS3StorageServiceModuleSchema)
export class AwsS3StorageServiceModule extends AModule<AwsS3StorageServiceModuleSchema, AwsS3StorageService> {
  async onInit(inputs: AwsS3StorageServiceModuleSchema): Promise<AwsS3StorageService> {
    const { account, app, awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

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

    // Create and register a new S3Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const s3Client = new S3Client({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(S3Client, s3Client, {
        metadata: { awsAccountId, awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return s3StorageService;
  }

  override async registerMetadata(
    inputs: AwsS3StorageServiceModuleSchema,
  ): Promise<{ account: Account; app: App; awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      account,
      app,
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
