import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsSubnetAnchorSchema } from './aws-subnet.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsSubnetAnchor extends AAnchor<AwsSubnetAnchorSchema, AwsSubnetAnchorSchema['parentInstance']> {
  declare properties: AwsSubnetAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsSubnetAnchorSchema['properties'],
    parent: AwsSubnetAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
