import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsServerlessEnvironmentAnchorSchema } from './aws-serverless-environment.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsServerlessEnvironmentAnchor extends AAnchor<
  AwsServerlessEnvironmentAnchorSchema,
  AwsServerlessEnvironmentAnchorSchema['parentInstance']
> {
  declare properties: AwsServerlessEnvironmentAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsServerlessEnvironmentAnchorSchema['properties'],
    parent: AwsServerlessEnvironmentAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
