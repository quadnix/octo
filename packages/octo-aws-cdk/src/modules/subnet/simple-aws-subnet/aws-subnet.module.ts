import { AModule, type Account, Module, type Subnet, SubnetType } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import { SubnetLocalFilesystemMountAnchor } from '../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.js';
import { AwsSubnetModuleSchema } from './index.schema.js';
import { AwsSubnet } from './models/subnet/index.js';
import { AwsSubnetLocalFilesystemMountOverlay } from './overlays/subnet-local-filesystem-mount/index.js';

@Module<AwsSubnetModule>('@octo', AwsSubnetModuleSchema)
export class AwsSubnetModule extends AModule<AwsSubnetModuleSchema, AwsSubnet> {
  async onInit(inputs: AwsSubnetModuleSchema): Promise<(AwsSubnet | AwsSubnetLocalFilesystemMountOverlay)[]> {
    const region = inputs.region;
    const { awsAccountId, awsAvailabilityZones, awsRegionId } = await this.registerMetadata(inputs);

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
      const [matchingEfsFilesystemAnchor] = await filesystem.getAnchorsMatchingSchema(EfsFilesystemAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (!matchingEfsFilesystemAnchor) {
        throw new Error(`Filesystem "${filesystem.filesystemName}" not found in "${awsRegionId}"!`);
      }

      // Add anchors.
      const subnetLocalFilesystemMountAnchor = new SubnetLocalFilesystemMountAnchor(
        `SubnetLocalFilesystemMountAnchor-${filesystem.filesystemName}`,
        { awsAccountId, awsRegionId, filesystemName: filesystem.filesystemName, subnetName: inputs.subnetName },
        subnet,
      );
      subnet.addAnchor(subnetLocalFilesystemMountAnchor);

      const subnetLocalFilesystemMountOverlay = new AwsSubnetLocalFilesystemMountOverlay(
        `subnet-local-filesystem-mount-overlay-${subnet.subnetName}-${filesystem.filesystemName}`,
        {
          filesystemName: filesystem.filesystemName,
          regionId: region.regionId,
          subnetId: subnet.subnetId,
          subnetName: subnet.subnetName,
        },
        [matchingEfsFilesystemAnchor, subnetLocalFilesystemMountAnchor],
      );
      models.push(subnetLocalFilesystemMountOverlay);
    }

    return models;
  }

  override async registerMetadata(
    inputs: AwsSubnetModuleSchema,
  ): Promise<{ awsAccountId: string; awsAvailabilityZones: string[]; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { awsRegionAZs, awsRegionId } = matchingAnchor.getSchemaInstance().properties;

    return {
      awsAccountId: account.accountId,
      awsAvailabilityZones: awsRegionAZs,
      awsRegionId,
    };
  }
}
