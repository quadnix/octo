import { Model, Region } from '@quadnix/octo';
import { AwsSingleAzRegionSchema } from './aws-single-az-region.schema.js';

/**
 * @group Modules/Region/AwsSingleAzRegion
 */
export enum AwsSingleAzRegionId {
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

/**
 * @internal
 */
@Model<AwsSingleAzRegion>('@octo', 'region', AwsSingleAzRegionSchema)
export class AwsSingleAzRegion extends Region {
  readonly awsRegionAZs: string[];

  readonly awsRegionId: string;

  override readonly regionId: AwsSingleAzRegionId;

  constructor(regionId: AwsSingleAzRegionId) {
    super(regionId);

    // Derive AWS regionId and AZ.
    const regionIdParts = AwsSingleAzRegion.getRegionIdParts(regionId);
    this.awsRegionAZs = [regionIdParts.awsRegionAZ];
    this.awsRegionId = regionIdParts.awsRegionId;

    this.regionId = regionId;
  }

  private static getRegionIdParts(regionId: AwsSingleAzRegionId): { awsRegionAZ: string; awsRegionId: string } {
    const regionIdParts = regionId.split('-');
    regionIdParts.shift();
    const awsRegionAZ = regionIdParts.join('-');
    const awsRegionId = awsRegionAZ.substring(0, awsRegionAZ.length - 1);
    return { awsRegionAZ, awsRegionId };
  }

  override synth(): AwsSingleAzRegionSchema {
    return {
      awsRegionAZs: this.awsRegionAZs,
      awsRegionId: this.awsRegionId,
      regionId: this.regionId,
    };
  }

  static override async unSynth(awsRegion: AwsSingleAzRegionSchema): Promise<AwsSingleAzRegion> {
    return new AwsSingleAzRegion(awsRegion.regionId as AwsSingleAzRegionId);
  }
}
