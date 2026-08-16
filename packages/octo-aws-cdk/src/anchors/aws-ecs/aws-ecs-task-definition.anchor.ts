import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcsTaskDefinitionAnchorSchema } from './aws-ecs-task-definition.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcsTaskDefinitionAnchor extends AAnchor<
  AwsEcsTaskDefinitionAnchorSchema,
  AwsEcsTaskDefinitionAnchorSchema['parentInstance']
> {
  declare properties: AwsEcsTaskDefinitionAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsEcsTaskDefinitionAnchorSchema['properties'],
    parent: AwsEcsTaskDefinitionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
