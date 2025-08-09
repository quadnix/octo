import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcsServerAnchorSchema } from './aws-ecs-server.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcsServerAnchor extends AAnchor<AwsEcsServerAnchorSchema, AwsEcsServerAnchorSchema['parentInstance']> {
  declare properties: AwsEcsServerAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEcsServerAnchorSchema['properties'],
    parent: AwsEcsServerAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
