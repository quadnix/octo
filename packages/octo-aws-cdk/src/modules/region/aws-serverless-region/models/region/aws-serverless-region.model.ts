import { Model, Region } from '@quadnix/octo';
import { AwsServerlessRegionSchema } from './aws-serverless-region.schema.js';

/**
 * @group Modules/Region/AwsServerlessRegion
 */
export enum AwsServerlessRegionId {
  AWS_AP_SOUTH_1 = 'aws-ap-south-1',
  AWS_US_EAST_1 = 'aws-us-east-1',
  AWS_US_WEST_1 = 'aws-us-west-1',
  AWS_US_WEST_2 = 'aws-us-west-2',
}

/**
 * @internal
 */
@Model<AwsServerlessRegion>('@octo', 'region', AwsServerlessRegionSchema)
export class AwsServerlessRegion extends Region {
  readonly awsRegionId: string;

  override readonly regionId: string;

  /**
   * @internal
   */
  constructor(name: string, regionId: AwsServerlessRegionId) {
    super(name);

    this.awsRegionId = regionId.replace(/^aws-/, '');
    this.regionId = name;
  }

  /**
   * @internal
   */
  static override async unSynth(region: AwsServerlessRegionSchema): Promise<AwsServerlessRegion> {
    return new AwsServerlessRegion(region.regionId, `aws-${region.awsRegionId}` as AwsServerlessRegionId);
  }

  /**
   * @internal
   */
  override synth(): AwsServerlessRegionSchema {
    return {
      awsRegionId: this.awsRegionId,
      regionId: this.regionId,
    };
  }
}
