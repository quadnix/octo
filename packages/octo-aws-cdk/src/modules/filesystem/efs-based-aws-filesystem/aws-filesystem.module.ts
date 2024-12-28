import { EFSClient } from '@aws-sdk/client-efs';
import {
  AModule,
  Account,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  Module,
  Region,
  Schema,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsFilesystem } from './models/filesystem/index.js';

export class AwsResourceSchema extends BaseResourceSchema {
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

    // Get AWS Region ID.
    const [resourceSynth] = (await region.getResourceMatchingSchema(AwsResourceSchema))!;
    const awsRegionId = resourceSynth.properties.awsRegionId;

    // Create a new filesystem.
    const filesystem = new AwsFilesystem(inputs.filesystemName);
    region.addFilesystem(filesystem);

    // Create and register a new EFSClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const efsClient = new EFSClient({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EFSClient, efsClient, {
        metadata: { awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return filesystem;
  }
}
