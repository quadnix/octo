import { S3Client } from '@aws-sdk/client-s3';
import {
  AModule,
  type Account,
  type App,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  Module,
  type Region,
  Schema,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsS3StorageService } from './models/s3-storage/index.js';

class AwsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.awsRegionId], options: { minLength: 1 } })
  override properties = Schema<{
    awsRegionId: string;
  }>();
}

export class AwsS3StorageServiceModuleSchema {
  bucketName = Schema<string>();

  region = Schema<Region>();

  remoteDirectoryPaths? = Schema<string[]>([]);
}

@Module<AwsS3StorageServiceModule>('@octo', AwsS3StorageServiceModuleSchema)
export class AwsS3StorageServiceModule extends AModule<AwsS3StorageServiceModuleSchema, AwsS3StorageService> {
  async onInit(inputs: AwsS3StorageServiceModuleSchema): Promise<AwsS3StorageService> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;
    const { awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new s3-storage service.
    const s3StorageService = new AwsS3StorageService(inputs.bucketName);
    app.addService(s3StorageService);

    // Add S3 directories.
    for (const remoteDirectoryPath of inputs.remoteDirectoryPaths || []) {
      s3StorageService.addDirectory(remoteDirectoryPath);
    }

    // Create and register a new S3Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const s3Client = new S3Client({ ...credentials });
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
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [[resourceSynth]] = await region.getResourcesMatchingSchema(AwsResourceSchema);
    const awsRegionId = resourceSynth.properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
