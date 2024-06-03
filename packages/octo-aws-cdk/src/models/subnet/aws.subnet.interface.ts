import type { ISubnet } from '@quadnix/octo';
import type { AwsSubnet } from './aws.subnet.model.js';

export interface IAwsSubnet extends ISubnet {
  filesystemMounts: AwsSubnet['filesystemMounts'];
}
