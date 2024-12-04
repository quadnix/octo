import { Model, Region } from '@quadnix/octo';
import { AwsRegionSchema } from './aws.region.schema.js';

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

@Model<AwsRegion>('@octo', 'region', AwsRegionSchema)
export class AwsRegion extends Region {
  readonly awsRegionAZ: string;

  readonly awsRegionId: string;

  override readonly regionId: RegionId;

  constructor(regionId: RegionId) {
    super(regionId);

    // Derive AWS regionId and AZ.
    const regionIdParts = AwsRegion.getRegionIdParts(regionId);
    this.awsRegionAZ = regionIdParts.awsRegionAZ;
    this.awsRegionId = regionIdParts.awsRegionId;

    this.regionId = regionId;
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

  override synth(): AwsRegionSchema {
    return {
      awsRegionAZ: this.awsRegionAZ,
      awsRegionId: this.awsRegionId,
      regionId: this.regionId,
    };
  }

  static override async unSynth(awsRegion: AwsRegionSchema): Promise<AwsRegion> {
    return new AwsRegion(awsRegion.regionId as RegionId);
  }
}
