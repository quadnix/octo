import { Container, Model, OverlayService, Subnet } from '@quadnix/octo';
import type { UnknownModel } from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { SubnetFilesystemMountOverlay } from '../../overlays/subnet-filesystem-mount/subnet-filesystem-mount.overlay.js';
import type { AwsRegion } from '../region/aws.region.model.js';
import type { IAwsSubnet } from './aws.subnet.interface.js';

@Model()
export class AwsSubnet extends Subnet {
  readonly filesystemMounts: { filesystemMountAnchorName: string; filesystemName: string }[];

  constructor(region: AwsRegion, name: string) {
    super(region, name);
  }

  async addFilesystemMount(filesystemName: string): Promise<void> {
    if (this.filesystemMounts.find((f) => f.filesystemName === filesystemName)) {
      throw new Error('Filesystem mount already added in AWS subnet!');
    }

    const region = this.getParents('region')['region'][0].to as AwsRegion;
    const regionFilesystem = region.filesystems.find((f) => f.filesystemName === filesystemName);
    if (!regionFilesystem) {
      throw new Error('Filesystem not found in AWS region!');
    }

    const regionFilesystemAnchorName = regionFilesystem.filesystemAnchorName;
    const regionFilesystemAnchor = region.getAnchor(regionFilesystemAnchorName)! as RegionFilesystemAnchor;

    // eslint-disable-next-line max-len
    const subnetFilesystemMountAnchorName = `${region.awsRegionId}-${this.subnetName}-${filesystemName}-FilesystemMount`;
    const subnetFilesystemMountAnchor = new SubnetFilesystemMountAnchor(
      subnetFilesystemMountAnchorName,
      regionFilesystem.filesystemName,
      this,
    );
    this.anchors.push(subnetFilesystemMountAnchor);
    this.filesystemMounts.push({ filesystemMountAnchorName: subnetFilesystemMountAnchorName, filesystemName });

    const overlayId = `${subnetFilesystemMountAnchorName}Overlay`;

    const overlayService = await Container.get(OverlayService);
    const subnetFilesystemMountOverlay = new SubnetFilesystemMountOverlay(overlayId, {}, [
      regionFilesystemAnchor,
      subnetFilesystemMountAnchor,
    ]);
    overlayService.addOverlay(subnetFilesystemMountOverlay);
  }

  async removeFilesystemMount(filesystemName: string): Promise<void> {
    const filesystemMount = this.filesystemMounts.find((f) => f.filesystemName === filesystemName);
    if (!filesystemMount) {
      throw new Error('Filesystem mount not found in AWS subnet!');
    }

    const overlayService = await Container.get(OverlayService);
    const overlays = overlayService.getOverlayByProperties();
    if (overlays.find((o) => o.getAnchor(filesystemMount.filesystemMountAnchorName))) {
      throw new Error('Cannot remove filesystem mount while overlay exists!');
    }

    const overlayId = `${filesystemMount.filesystemMountAnchorName}Overlay`;
    const overlay = overlayService.getOverlayById(overlayId);
    overlayService.removeOverlay(overlay!);
  }

  override synth(): IAwsSubnet {
    return {
      ...super.synth(),
      filesystemMounts: [...this.filesystemMounts],
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
