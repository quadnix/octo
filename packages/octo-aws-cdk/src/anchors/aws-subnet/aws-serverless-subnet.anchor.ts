import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsServerlessSubnetAnchorSchema } from './aws-serverless-subnet.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsServerlessSubnetAnchor extends AAnchor<
  AwsServerlessSubnetAnchorSchema,
  AwsServerlessSubnetAnchorSchema['parentInstance']
> {
  declare properties: AwsServerlessSubnetAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsServerlessSubnetAnchorSchema['properties'],
    parent: AwsServerlessSubnetAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
