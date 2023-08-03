import { Region } from '@quadnix/octo';

export enum AWSRegionId {
  AWS_AP_SOUTH_1 = 'aws-ap-south-1',
  AWS_US_EAST_1 = 'aws-us-east-1',
  AWS_US_WEST_1 = 'aws-us-west-1',
  AWS_US_WEST_2 = 'aws-us-west-2',
}

export class AwsRegion extends Region {
  override readonly regionId: AWSRegionId;

  readonly nativeAwsRegionId: string;

  constructor(regionId: AWSRegionId) {
    super(regionId);

    this.regionId = regionId;

    const regionIdParts = regionId.split('-');
    regionIdParts.shift();
    this.nativeAwsRegionId = regionIdParts.join('-');
  }
}
