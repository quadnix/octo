import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcsExecutionAnchorSchema } from './aws-ecs-execution.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcsExecutionAnchor extends AAnchor<
  AwsEcsExecutionAnchorSchema,
  AwsEcsExecutionAnchorSchema['parentInstance']
> {
  declare properties: AwsEcsExecutionAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEcsExecutionAnchorSchema['properties'],
    parent: AwsEcsExecutionAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
