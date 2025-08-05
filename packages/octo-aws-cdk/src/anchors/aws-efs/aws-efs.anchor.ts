import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEfsAnchorSchema } from './aws-efs.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEfsAnchor extends AAnchor<AwsEfsAnchorSchema, AwsEfsAnchorSchema['parentInstance']> {
  declare properties: AwsEfsAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEfsAnchorSchema['properties'],
    parent: AwsEfsAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
