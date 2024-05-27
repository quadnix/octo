import { IRegion } from '@quadnix/octo';
import { AwsRegion } from './aws.region.model.js';

export interface IAwsRegion extends IRegion {
  awsRegionAZ: AwsRegion['awsRegionAZ'];
  awsRegionId: AwsRegion['awsRegionId'];
  filesystems: AwsRegion['filesystems'];
}
