import { AAnchor, Anchor } from '@quadnix/octo';
import type { SecurityGroupAnchorSchema } from './security-group.anchor.schema.js';

@Anchor('@octo')
/**
 * @internal
 */
export class SecurityGroupAnchor extends AAnchor<
  SecurityGroupAnchorSchema,
  SecurityGroupAnchorSchema['parentInstance']
> {
  declare properties: SecurityGroupAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: SecurityGroupAnchorSchema['properties'],
    parent: SecurityGroupAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
