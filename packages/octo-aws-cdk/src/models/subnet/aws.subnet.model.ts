import { Container, Model, ModelError, OverlayService, Subnet, type UnknownModel } from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { RegionFilesystemOverlay } from '../../overlays/region-filesystem/region-filesystem.overlay.js';
import { SubnetFilesystemMountOverlay } from '../../overlays/subnet-filesystem-mount/subnet-filesystem-mount.overlay.js';
import type { AwsRegion } from '../region/aws.region.model.js';
import type { IAwsSubnet } from './aws.subnet.interface.js';

@Model()
export class AwsSubnet extends Subnet {
  readonly filesystemMounts: { filesystemMountAnchorName: string; filesystemName: string }[] = [];

  constructor(region: AwsRegion, name: string) {
    super(region, name);
  }

  async addFilesystemMount(filesystemName: string): Promise<void> {
    if (this.filesystemMounts.find((f) => f.filesystemName === filesystemName)) {
      throw new ModelError('Filesystem mount already added in AWS subnet!', this);
    }

    const region = this.getParents('region')['region'][0].to as AwsRegion;
    const regionFilesystem = region.filesystems.find((f) => f.filesystemName === filesystemName);
    if (!regionFilesystem) {
      throw new ModelError('Filesystem not found in AWS region!', this);
    }

    const overlayService = await Container.get(OverlayService);

    const regionFilesystemAnchorName = regionFilesystem.filesystemAnchorName;
    const regionFilesystemAnchor = region.getAnchor(regionFilesystemAnchorName) as RegionFilesystemAnchor;

    const regionFilesystemOverlayId = `region-filesystem-overlay-${regionFilesystemAnchorName}`;
    const regionFilesystemOverlay = overlayService.getOverlayById(regionFilesystemOverlayId) as RegionFilesystemOverlay;

    // eslint-disable-next-line max-len
    const subnetFilesystemMountAnchorName = `${region.awsRegionId}-${this.subnetName}-${filesystemName}-FilesystemMountAnchor`;
    const subnetFilesystemMountAnchor = new SubnetFilesystemMountAnchor(
      subnetFilesystemMountAnchorName,
      { filesystemName: regionFilesystem.filesystemName },
      this,
    );
    this.addAnchor(subnetFilesystemMountAnchor);
    this.filesystemMounts.push({ filesystemMountAnchorName: subnetFilesystemMountAnchorName, filesystemName });

    const overlayId = `subnet-filesystem-mount-overlay-${subnetFilesystemMountAnchorName}`;
    const subnetFilesystemMountOverlay = new SubnetFilesystemMountOverlay(overlayId, {}, [
      regionFilesystemAnchor,
      subnetFilesystemMountAnchor,
    ]);
    overlayService.addOverlay(subnetFilesystemMountOverlay);

    // RegionFilesystemOverlay vs SubnetFilesystemMountOverlay relationship.
    regionFilesystemOverlay.addChild('overlayId', subnetFilesystemMountOverlay, 'overlayId');
  }

  override synth(): IAwsSubnet {
    return {
      ...super.synth(),
      filesystemMounts: JSON.parse(JSON.stringify(this.filesystemMounts)),
    };
  }

  static override async unSynth(
    subnet: IAwsSubnet,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<AwsSubnet> {
    const region = (await deReferenceContext(subnet.region.context)) as AwsRegion;
    const newSubnet = new AwsSubnet(region, subnet.subnetName);

    newSubnet.disableSubnetIntraNetwork = subnet.options.disableSubnetIntraNetwork;
    newSubnet.filesystemMounts.push(...subnet.filesystemMounts);
    newSubnet.subnetType = subnet.options.subnetType;

    return newSubnet;
  }
}
