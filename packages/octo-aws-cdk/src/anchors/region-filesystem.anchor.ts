import { AAnchor, Anchor, type IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsRegion } from '../models/region/aws.region.model.js';

interface IRegionFilesystemAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      filesystemName: string;
    }
  > {}

@Anchor()
export class RegionFilesystemAnchor extends AAnchor {
  declare properties: IRegionFilesystemAnchorProperties;

  constructor(anchorId: string, properties: IRegionFilesystemAnchorProperties, parent: AwsRegion) {
    super(anchorId, properties, parent);
  }
}
