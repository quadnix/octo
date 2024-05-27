import { AAnchor, Anchor } from '@quadnix/octo';
import { AwsSubnet } from '../models/subnet/aws.subnet.model.js';

@Anchor()
export class SubnetFilesystemMountAnchor extends AAnchor {
  constructor(anchorId: string, parent: AwsSubnet) {
    super(anchorId, parent);
  }
}
