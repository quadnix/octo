import { AAnchor, Anchor } from '@quadnix/octo';
import { AwsRegion } from '../models/region/aws.region.model.js';

@Anchor()
export class RegionFilesystemAnchor extends AAnchor {
  constructor(anchorId: string, parent: AwsRegion) {
    super(anchorId, parent);
  }
}
