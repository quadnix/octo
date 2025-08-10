import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcsAlbAnchorSchema } from './aws-ecs-alb.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcsAlbAnchor extends AAnchor<AwsEcsAlbAnchorSchema, AwsEcsAlbAnchorSchema['parentInstance']> {
  declare properties: AwsEcsAlbAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEcsAlbAnchorSchema['properties'],
    parent: AwsEcsAlbAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
