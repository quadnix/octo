import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsDeploymentAnchorSchema } from './aws-deployment.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsDeploymentAnchor extends AAnchor<
  AwsDeploymentAnchorSchema,
  AwsDeploymentAnchorSchema['parentInstance']
> {
  declare properties: AwsDeploymentAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsDeploymentAnchorSchema['properties'],
    parent: AwsDeploymentAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
