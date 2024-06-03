import type { IRegion } from '@quadnix/octo';
import type { AwsRegion } from './aws.region.model.js';

export interface IAwsRegion extends IRegion {
  awsRegionAZ: AwsRegion['awsRegionAZ'];
  awsRegionId: AwsRegion['awsRegionId'];
  filesystems: AwsRegion['filesystems'];
}
