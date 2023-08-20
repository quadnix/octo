import { Region } from '@quadnix/octo';
import { IAwsRegion } from './aws.region.interface';

export enum AwsRegionId {
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

export class AwsRegion extends Region {
  readonly nativeAwsRegionAZ: string;

  readonly nativeAwsRegionId: string;

  override readonly regionId: AwsRegionId;

  constructor(regionId: AwsRegionId) {
    super(regionId);

    // Derive AWS regionId and AZ.
    const regionIdParts = regionId.split('-');
    regionIdParts.shift();
    this.nativeAwsRegionAZ = regionIdParts.join('-');
    this.nativeAwsRegionId = this.nativeAwsRegionAZ.substring(0, this.nativeAwsRegionAZ.length - 1);

    this.regionId = regionId;
  }

  override synth(): IAwsRegion {
    return {
      nativeAwsRegionAZ: this.nativeAwsRegionAZ,
      nativeAwsRegionId: this.nativeAwsRegionId,
      regionId: this.regionId,
    };
  }

  static async unSynth(awsRegion: IAwsRegion): Promise<AwsRegion> {
    return new AwsRegion(awsRegion.regionId as AwsRegionId);
  }
}
