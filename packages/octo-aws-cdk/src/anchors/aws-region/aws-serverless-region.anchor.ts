import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsServerlessRegionAnchorSchema } from './aws-serverless-region.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsServerlessRegionAnchor extends AAnchor<
  AwsServerlessRegionAnchorSchema,
  AwsServerlessRegionAnchorSchema['parentInstance']
> {
  declare properties: AwsServerlessRegionAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsServerlessRegionAnchorSchema['properties'],
    parent: AwsServerlessRegionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
