import { Container, Model, OverlayService, Region } from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../anchors/region-filesystem.anchor.js';
import { RegionFilesystemOverlay } from '../../overlays/region-filesystem/region-filesystem.overlay.js';
import type { IAwsRegion } from './aws.region.interface.js';

export enum RegionId {
  AWS_AP_SOUTH_1A = 'aws-ap-south-1a',
  AWS_AP_SOUTH_1B = 'aws-ap-south-1b',
  AWS_AP_SOUTH_1C = 'aws-ap-south-1c',
  AWS_US_EAST_1A = 'aws-us-east-1a',
  AWS_US_EAST_1B = 'aws-us-east-1b',
  AWS_US_EAST_1C = 'aws-us-east-1c',
  AWS_US_EAST_1D = 'aws-us-east-1d',
  AWS_US_EAST_1E = 'aws-us-east-1e',
  AWS_US_EAST_1F = 'aws-us-east-1f',
  AWS_US_WEST_1A = 'aws-us-west-1a',
  AWS_US_WEST_1B = 'aws-us-west-1b',
  AWS_US_WEST_2A = 'aws-us-west-2a',
  AWS_US_WEST_2B = 'aws-us-west-2b',
  AWS_US_WEST_2C = 'aws-us-west-2c',
  AWS_US_WEST_2D = 'aws-us-west-2d',
}

@Model()
export class AwsRegion extends Region {
  readonly awsRegionAZ: string;

  readonly awsRegionId: string;

  readonly filesystems: { filesystemAnchorName: string; filesystemName: string }[] = [];

  override readonly regionId: RegionId;

  constructor(regionId: RegionId) {
    super(regionId);

    // Derive AWS regionId and AZ.
    const regionIdParts = AwsRegion.getRegionIdParts(regionId);
    this.awsRegionAZ = regionIdParts.awsRegionAZ;
    this.awsRegionId = regionIdParts.awsRegionId;

    this.regionId = regionId;
  }

  async addFilesystem(filesystemName: string): Promise<void> {
    if (this.filesystems.find((f) => f.filesystemName === filesystemName)) {
      throw new Error('Filesystem already added in AWS region!');
    }

    const regionFilesystemAnchorName = `${this.awsRegionId}-${filesystemName}-Filesystem`;
    const regionFilesystemAnchor = new RegionFilesystemAnchor(regionFilesystemAnchorName, filesystemName, this);
    this.anchors.push(regionFilesystemAnchor);
    this.filesystems.push({ filesystemAnchorName: regionFilesystemAnchorName, filesystemName });

    const overlayId = `${regionFilesystemAnchorName}Overlay`;

    const overlayService = await Container.get(OverlayService);
    const regionFilesystemOverlay = new RegionFilesystemOverlay(
      overlayId,
      { awsRegionId: this.awsRegionId, filesystemName, regionId: this.regionId },
      [regionFilesystemAnchor],
    );
    overlayService.addOverlay(regionFilesystemOverlay);
  }

  static getRegionIdParts(regionId: RegionId): { awsRegionAZ: string; awsRegionId: string } {
    const regionIdParts = regionId.split('-');
    regionIdParts.shift();
    const awsRegionAZ = regionIdParts.join('-');
    const awsRegionId = awsRegionAZ.substring(0, awsRegionAZ.length - 1);
    return { awsRegionAZ, awsRegionId };
  }

  static getRandomRegionIdFromAwsRegionId(awsRegionId: string): RegionId | undefined {
    return Object.values(RegionId).find((value) => this.getRegionIdParts(value).awsRegionId === awsRegionId);
  }

  async removeFilesystem(filesystemName: string): Promise<void> {
    const filesystem = this.filesystems.find((f) => f.filesystemName === filesystemName);
    if (!filesystem) {
      throw new Error('Filesystem not found in AWS region!');
    }

    const overlayService = await Container.get(OverlayService);
    const overlays = overlayService.getOverlayByProperties();
    if (overlays.find((o) => o.getAnchor(filesystem.filesystemAnchorName))) {
      throw new Error('Cannot remove filesystem while overlay exists!');
    }

    const overlayId = `${filesystem.filesystemAnchorName}Overlay`;
    const overlay = overlayService.getOverlayById(overlayId);
    overlayService.removeOverlay(overlay!);
  }

  override synth(): IAwsRegion {
    return {
      awsRegionAZ: this.awsRegionAZ,
      awsRegionId: this.awsRegionId,
      filesystems: [...this.filesystems],
      regionId: this.regionId,
    };
  }

  static override async unSynth(awsRegion: IAwsRegion): Promise<AwsRegion> {
    const newRegion = new AwsRegion(awsRegion.regionId as RegionId);
    newRegion.filesystems.push(...awsRegion.filesystems);
    return newRegion;
  }
}
