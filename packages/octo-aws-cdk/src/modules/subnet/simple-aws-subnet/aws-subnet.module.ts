import { EC2Client } from '@aws-sdk/client-ec2';
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
  SubnetType,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsFilesystemAnchor } from './anchors/aws-filesystem.anchor.js';
import { AwsSubnetLocalFilesystemMountAnchor } from './anchors/aws-subnet-local-filesystem-mount.anchor.js';
import { AwsSubnet } from './models/subnet/index.js';
import { AwsSubnetLocalFilesystemMountOverlay } from './overlays/subnet-local-filesystem-mount/index.js';

export class EfsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.awsRegionId, value.filesystemName], options: { minLength: 1 } })
  override properties = Schema<{
    awsRegionId: string;
    filesystemName: string;
  }>();

  @Validate({ destruct: (value): string[] => [value.FileSystemId, value.FileSystemArn], options: { minLength: 1 } })
  override response = Schema<{
    FileSystemArn: string;
    FileSystemId: string;
  }>();
}

export class InternetGatewayResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.InternetGatewayId], options: { minLength: 1 } })
  override response = Schema<{
    InternetGatewayId: string;
  }>();
}

export class VpcResourceSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value): string[] => [value.awsAvailabilityZones, value.awsRegionId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAvailabilityZones: string[];
    awsRegionId: string;
  }>();

  @Validate({ destruct: (value): string[] => [value.VpcId], options: { minLength: 1 } })
  override response = Schema<{
    VpcId: string;
  }>();
}

export class AwsSubnetModuleSchema {
  localFilesystems? = Schema<Filesystem[]>([]);

  region = Schema<Region>();

  subnetAvailabilityZone = Schema<string>();

  subnetCidrBlock = Schema<string>();

  subnetName = Schema<string>();

  subnetOptions? = Schema<{ disableSubnetIntraNetwork: boolean; subnetType: SubnetType }>({
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  });

  subnetSiblings? = Schema<{ subnetCidrBlock: string; subnetName: string }[]>([]);
}

@Module<AwsSubnetModule>('@octo', AwsSubnetModuleSchema)
export class AwsSubnetModule extends AModule<AwsSubnetModuleSchema, AwsSubnet> {
  async onInit(inputs: AwsSubnetModuleSchema): Promise<(AwsSubnet | AwsSubnetLocalFilesystemMountOverlay)[]> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS AZs and Region ID.
    const [[vpcSynth]] = await region.getResourcesMatchingSchema(VpcResourceSchema);
    const awsAvailabilityZones = vpcSynth.properties.awsAvailabilityZones;
    const awsRegionId = vpcSynth.properties.awsRegionId;

    // Validate subnet availability zone.
    if (!awsAvailabilityZones.includes(inputs.subnetAvailabilityZone)) {
      throw new Error('Invalid subnet availability zone!');
    }

    // Create a new subnet.
    const subnet = new AwsSubnet(region, inputs.subnetName);
    subnet.disableSubnetIntraNetwork = inputs.subnetOptions?.disableSubnetIntraNetwork || false;
    subnet.subnetType = inputs.subnetOptions?.subnetType || SubnetType.PRIVATE;
    region.addSubnet(subnet);

    const models: (AwsSubnet | AwsSubnetLocalFilesystemMountOverlay)[] = [subnet];

    // Associate subnet with siblings.
    const regionSubnets = (region.getChildren('subnet')['subnet'] || []).map((d) => d.to as Subnet);
    for (const { subnetName } of inputs.subnetSiblings || []) {
      const siblingSubnet = regionSubnets.find((s) => s.subnetName === subnetName);
      if (!siblingSubnet) {
        throw new Error(`Sibling subnet "${subnetName}" not found!`);
      }
      subnet.updateNetworkingRules(siblingSubnet, true);
    }

    for (const filesystem of inputs.localFilesystems || []) {
      const matchingEfsResources = await filesystem.getResourcesMatchingSchema(
        EfsResourceSchema,
        [
          { key: 'awsRegionId', value: awsRegionId },
          { key: 'filesystemName', value: filesystem.filesystemName },
        ],
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      if (matchingEfsResources.length !== 1) {
        throw new Error(`Filesystem "${filesystem.filesystemName}" not found in "${awsRegionId}"!`);
      }

      const filesystemAnchor = new AwsFilesystemAnchor(`AwsFilesystemAnchor`, {}, filesystem);
      const subnetLocalFilesystemMountAnchor = new AwsSubnetLocalFilesystemMountAnchor(
        `AwsSubnetLocalFilesystemMountAnchor-${filesystem.filesystemName}`,
        {},
        subnet,
      );

      const subnetLocalFilesystemMountOverlay = new AwsSubnetLocalFilesystemMountOverlay(
        `subnet-local-filesystem-mount-overlay-${subnet.subnetName}-${filesystem.filesystemName}`,
        {
          filesystemName: filesystem.filesystemName,
          regionId: region.regionId,
          subnetId: subnet.subnetId,
          subnetName: subnet.subnetName,
        },
        [filesystemAnchor, subnetLocalFilesystemMountAnchor],
      );
      models.push(subnetLocalFilesystemMountOverlay);
    }

    // Create and register a new EC2Client & EFSClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const ec2Client = new EC2Client({ ...credentials, region: awsRegionId });
    const efsClient = new EFSClient({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EC2Client, ec2Client, {
        metadata: { awsRegionId, package: '@octo' },
      });
      container.registerValue(EFSClient, efsClient, {
        metadata: { awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return models;
  }
}
