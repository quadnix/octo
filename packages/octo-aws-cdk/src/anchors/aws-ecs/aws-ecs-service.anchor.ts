import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcsServiceAnchorSchema } from './aws-ecs-service.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcsServiceAnchor extends AAnchor<
  AwsEcsServiceAnchorSchema,
  AwsEcsServiceAnchorSchema['parentInstance']
> {
  declare properties: AwsEcsServiceAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEcsServiceAnchorSchema['properties'],
    parent: AwsEcsServiceAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
