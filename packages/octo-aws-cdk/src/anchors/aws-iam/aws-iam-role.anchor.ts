import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsIamRoleAnchorSchema } from './aws-iam-role.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsIamRoleAnchor extends AAnchor<AwsIamRoleAnchorSchema, AwsIamRoleAnchorSchema['parentInstance']> {
  declare properties: AwsIamRoleAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsIamRoleAnchorSchema['properties'],
    parent: AwsIamRoleAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
