import { EFSClient } from '@aws-sdk/client-efs';
import { AModule, type Account, Container, ContainerRegistrationError, Module } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsFilesystemModuleSchema } from './index.schema.js';
import { AwsFilesystem } from './models/filesystem/index.js';

@Module<AwsFilesystemModule>('@octo', AwsFilesystemModuleSchema)
export class AwsFilesystemModule extends AModule<AwsFilesystemModuleSchema, AwsFilesystem> {
  async onInit(inputs: AwsFilesystemModuleSchema): Promise<AwsFilesystem> {
    const region = inputs.region;
    const { account, awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

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
  ): Promise<{ account: Account; awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      account,
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
