import { EFSClient } from '@aws-sdk/client-efs';
import {
  AModule,
  type Account,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  Module,
  type Region,
  Schema,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsFilesystem } from './models/filesystem/index.js';

class AwsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.awsRegionId], options: { minLength: 1 } })
  override properties = Schema<{
    awsRegionId: string;
  }>();
}

export class AwsFilesystemModuleSchema {
  filesystemName = Schema<string>();

  region = Schema<Region>();
}

@Module<AwsFilesystemModule>('@octo', AwsFilesystemModuleSchema)
export class AwsFilesystemModule extends AModule<AwsFilesystemModuleSchema, AwsFilesystem> {
  async onInit(inputs: AwsFilesystemModuleSchema): Promise<AwsFilesystem> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const { awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new filesystem.
    const filesystem = new AwsFilesystem(inputs.filesystemName);
    region.addFilesystem(filesystem);

    // Create and register a new EFSClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const efsClient = new EFSClient({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EFSClient, efsClient, {
        metadata: { awsAccountId, awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return filesystem;
  }

  override async registerMetadata(
    inputs: AwsFilesystemModuleSchema,
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
