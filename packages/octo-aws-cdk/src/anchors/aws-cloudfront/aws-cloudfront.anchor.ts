import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsCloudFrontAnchorSchema } from './aws-cloudfront.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsCloudFrontAnchor extends AAnchor<
  AwsCloudFrontAnchorSchema,
  AwsCloudFrontAnchorSchema['parentInstance']
> {
  declare properties: AwsCloudFrontAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsCloudFrontAnchorSchema['properties'],
    parent: AwsCloudFrontAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
