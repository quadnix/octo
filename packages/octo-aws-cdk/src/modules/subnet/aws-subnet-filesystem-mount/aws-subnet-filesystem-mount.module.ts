import { EFSClient } from '@aws-sdk/client-efs';
import {
  AModule,
  type Account,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  type Filesystem,
  Module,
  type Region,
  Schema,
  type Subnet,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsFilesystemAnchor } from './anchors/aws-filesystem.anchor.js';
import { AwsSubnetFilesystemMountAnchor } from './anchors/aws-subnet-filesystem-mount.anchor.js';
import { AwsSubnetFilesystemMountOverlay } from './overlays/subnet-filesystem-mount/index.js';

export class AwsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.awsRegionId], options: { minLength: 1 } })
  override properties = Schema<{
    awsRegionId: string;
  }>();
}

export class EfsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.FileSystemId, value.FileSystemArn], options: { minLength: 1 } })
  override response = Schema<{
    FileSystemArn: string;
    FileSystemId: string;
  }>();
}

export class SubnetResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.SubnetId], options: { minLength: 1 } })
  override response = Schema<{
    SubnetId: string;
  }>();
}

export class AwsSubnetFilesystemMountSchema {
  filesystem = Schema<Filesystem>();

  subnet = Schema<Subnet>();
}

@Module<AwsSubnetFilesystemMountModule>('@octo', AwsSubnetFilesystemMountSchema)
export class AwsSubnetFilesystemMountModule extends AModule<
  AwsSubnetFilesystemMountSchema,
  AwsSubnetFilesystemMountOverlay
> {
  async onInit(inputs: AwsSubnetFilesystemMountSchema): Promise<AwsSubnetFilesystemMountOverlay> {
    const filesystem = inputs.filesystem;
    const subnet = inputs.subnet;
    const region = filesystem.getParents()['region'][0].to as Region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [resourceSynth] = (await region.getResourceMatchingSchema(AwsResourceSchema))!;
    const awsRegionId = resourceSynth.properties.awsRegionId;

    const filesystemAnchor = new AwsFilesystemAnchor(`AwsFilesystemAnchor`, {}, filesystem);
    const subnetFilesystemMountAnchor = new AwsSubnetFilesystemMountAnchor(
      `AwsSubnetFilesystemMountAnchor`,
      {},
      subnet,
    );

    const overlay = new AwsSubnetFilesystemMountOverlay(
      `subnet-filesystem-mount-overlay-${subnet.subnetName}-${filesystem.filesystemName}`,
      {
        filesystemName: filesystem.filesystemName,
        regionId: region.regionId,
        subnetId: subnet.subnetId,
        subnetName: subnet.subnetName,
      },
      [filesystemAnchor, subnetFilesystemMountAnchor],
    );

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

    return overlay;
  }
}
