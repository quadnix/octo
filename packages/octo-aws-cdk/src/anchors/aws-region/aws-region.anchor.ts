import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from './aws-region.anchor.schema.js';

@Anchor('@octo')
/**
 * @internal
 */
export class AwsRegionAnchor extends AAnchor<AwsRegionAnchorSchema, AwsRegionAnchorSchema['parentInstance']> {
  declare properties: AwsRegionAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsRegionAnchorSchema['properties'],
    parent: AwsRegionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
