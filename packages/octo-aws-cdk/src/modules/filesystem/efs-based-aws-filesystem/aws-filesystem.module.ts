import { EFSClient } from '@aws-sdk/client-efs';
import { AModule, Account, Container, ContainerRegistrationError, Module, Region, Schema } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsFilesystem } from './models/filesystem/index.js';

export class AwsFilesystemModuleSchema {
  awsRegionId = Schema<string>();

  filesystemName = Schema<string>();

  region = Schema<Region>();
}

@Module<AwsFilesystemModule>('@octo', AwsFilesystemModuleSchema)
export class AwsFilesystemModule extends AModule<AwsFilesystemModuleSchema, AwsFilesystem> {
  async onInit(inputs: AwsFilesystemModuleSchema): Promise<AwsFilesystem> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Create a new filesystem.
    const filesystem = new AwsFilesystem(inputs.filesystemName);
    region.addFilesystem(filesystem);

    // Create and register a new EFSClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const efsClient = new EFSClient({ ...credentials, region: inputs.awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EFSClient, efsClient, {
        metadata: { awsRegionId: inputs.awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return filesystem;
  }
}
