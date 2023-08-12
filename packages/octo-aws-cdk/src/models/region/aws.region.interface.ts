import { IRegion } from '@quadnix/octo';
import { AwsRegion } from './aws.region.model';

export interface IAwsRegion extends IRegion {
  nativeAwsRegionId: AwsRegion['nativeAwsRegionId'];
  nativeAwsRegionAZ: AwsRegion['nativeAwsRegionAZ'];
}
