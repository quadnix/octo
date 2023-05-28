import { App } from '../../app/app.model';
import { Region } from '../region.model';

export type AwsRegionId = 'aws-us-east-1' | 'aws-ap-south-1';

export class AwsRegion extends Region {
  constructor(context: App, regionId: AwsRegionId) {
    super(context, regionId);
  }
}
