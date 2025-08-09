import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsSecurityGroupAnchorSchema } from './aws-security-group.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsSecurityGroupAnchor extends AAnchor<
  AwsSecurityGroupAnchorSchema,
  AwsSecurityGroupAnchorSchema['parentInstance']
> {
  declare properties: AwsSecurityGroupAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsSecurityGroupAnchorSchema['properties'],
    parent: AwsSecurityGroupAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
