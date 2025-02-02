import { AAnchor, Anchor, type Region } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from './aws-region.anchor.schema.js';

@Anchor('@octo')
export class AwsRegionAnchor extends AAnchor<AwsRegionAnchorSchema, Region> {
  declare properties: AwsRegionAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsRegionAnchorSchema['properties'], parent: Region) {
    super(anchorId, properties, parent);
  }
}
