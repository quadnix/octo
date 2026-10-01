import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsServerAnchorSchema } from './aws-server.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsServerAnchor extends AAnchor<AwsServerAnchorSchema, AwsServerAnchorSchema['parentInstance']> {
  declare properties: AwsServerAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsServerAnchorSchema['properties'],
    parent: AwsServerAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
