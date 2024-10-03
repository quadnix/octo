import { AAnchor, Anchor, type IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsSubnet } from '../models/subnet/aws.subnet.model.js';

interface ISubnetFilesystemMountAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      filesystemName: string;
      subnetId: string;
      subnetName: string;
    }
  > {}

@Anchor('@octo')
export class SubnetFilesystemMountAnchor extends AAnchor {
  declare properties: ISubnetFilesystemMountAnchorProperties;

  constructor(anchorId: string, properties: ISubnetFilesystemMountAnchorProperties, parent: AwsSubnet) {
    super(anchorId, properties, parent);
  }
}
