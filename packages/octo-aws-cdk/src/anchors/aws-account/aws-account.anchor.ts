import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from './aws-account.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsAccountAnchor extends AAnchor<AwsAccountAnchorSchema, AwsAccountAnchorSchema['parentInstance']> {
  declare properties: AwsAccountAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsAccountAnchorSchema['properties'],
    parent: AwsAccountAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
