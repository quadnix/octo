import { Region } from '../region.model';

export type AwsRegionId = 'aws-us-east-1' | 'aws-ap-south-1';

export class AwsRegion extends Region {
  constructor(regionId: AwsRegionId) {
    super(regionId);
  }
}
