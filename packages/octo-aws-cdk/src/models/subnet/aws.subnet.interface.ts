import { ISubnet } from '@quadnix/octo';
import { AwsSubnet } from './aws.subnet.model.js';

export interface IAwsSubnet extends ISubnet {
  filesystemMounts: AwsSubnet['filesystemMounts'];
}
