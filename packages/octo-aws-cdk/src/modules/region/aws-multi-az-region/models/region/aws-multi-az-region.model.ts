import { Model, ModelError, Region } from '@quadnix/octo';
import { AwsMultiAzRegionSchema } from './aws-multi-az-region.schema.js';

/**
 * @group Modules/Region/AwsMultiAzRegion
 */
export enum AwsMultiAzRegionId {
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
@Model<AwsMultiAzRegion>('@octo', 'region', AwsMultiAzRegionSchema)
export class AwsMultiAzRegion extends Region {
  readonly awsRegionAZs: string[];

  readonly awsRegionId: string;

  override readonly regionId: string;

  constructor(name: string, regionIds: AwsMultiAzRegionId[]) {
    super(name);

    // Derive AWS regionId and AZs.
    const awsRegionAZs: string[] = [];
    const awsRegionIds: Set<string> = new Set();
    for (const regionId of regionIds) {
      const regionIdParts = AwsMultiAzRegion.getRegionIdParts(regionId);
      awsRegionAZs.push(regionIdParts.awsRegionAZ);
      awsRegionIds.add(regionIdParts.awsRegionId);
    }
    if (awsRegionIds.size !== 1) {
      throw new ModelError(`Found separate AWS regionIds: ${regionIds.join(', ')}`, this);
    }
    if (awsRegionAZs.length !== regionIds.length) {
      throw new ModelError(`Found duplicate AWS regionIds: ${regionIds.join(', ')}`, this);
    }

    this.awsRegionAZs = awsRegionAZs.sort();
    this.awsRegionId = awsRegionIds.values().next().value;
    this.regionId = name;
  }

  private static getRegionIdParts(regionId: AwsMultiAzRegionId): { awsRegionAZ: string; awsRegionId: string } {
    const regionIdParts = regionId.split('-');
    regionIdParts.shift();
    const awsRegionAZ = regionIdParts.join('-');
    const awsRegionId = awsRegionAZ.substring(0, awsRegionAZ.length - 1);
    return { awsRegionAZ, awsRegionId };
  }

  override synth(): AwsMultiAzRegionSchema {
    return {
      awsRegionAZs: this.awsRegionAZs,
      awsRegionId: this.awsRegionId,
      regionId: this.regionId,
    };
  }

  static override async unSynth(region: AwsMultiAzRegionSchema): Promise<AwsMultiAzRegion> {
    return new AwsMultiAzRegion(region.regionId, region.awsRegionAZs.map((az) => `aws-${az}`) as AwsMultiAzRegionId[]);
  }
}
