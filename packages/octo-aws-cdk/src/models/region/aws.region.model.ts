import { Container, Model, ModelError, OverlayService, Region, Validate } from '@quadnix/octo';
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

  @Validate({
    destruct: (value: { filesystemName: string }[]): string[] => value.map((v) => v.filesystemName),
    options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ },
  })
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
      throw new ModelError('Filesystem already added in AWS region!', this);
    }

    const regionFilesystemAnchorName = `${this.awsRegionId}-${filesystemName}-FilesystemAnchor`;
    const regionFilesystemAnchor = new RegionFilesystemAnchor(regionFilesystemAnchorName, { filesystemName }, this);
    this.addAnchor(regionFilesystemAnchor);
    this.filesystems.push({ filesystemAnchorName: regionFilesystemAnchorName, filesystemName });

    const overlayService = await Container.get(OverlayService);

    const overlayId = `region-filesystem-overlay-${regionFilesystemAnchorName}`;
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

  override synth(): IAwsRegion {
    return {
      awsRegionAZ: this.awsRegionAZ,
      awsRegionId: this.awsRegionId,
      filesystems: JSON.parse(JSON.stringify(this.filesystems)),
      regionId: this.regionId,
    };
  }

  static override async unSynth(awsRegion: IAwsRegion): Promise<AwsRegion> {
    const newRegion = new AwsRegion(awsRegion.regionId as RegionId);
    newRegion.filesystems.push(...awsRegion.filesystems);
    return newRegion;
  }
}
