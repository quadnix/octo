import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcsClusterAnchorSchema } from './aws-ecs-cluster.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcsClusterAnchor extends AAnchor<
  AwsEcsClusterAnchorSchema,
  AwsEcsClusterAnchorSchema['parentInstance']
> {
  declare properties: AwsEcsClusterAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEcsClusterAnchorSchema['properties'],
    parent: AwsEcsClusterAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
