import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsEcrImageAnchorSchema } from './aws-ecr-image.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsEcrImageAnchor extends AAnchor<AwsEcrImageAnchorSchema, AwsEcrImageAnchorSchema['parentInstance']> {
  declare properties: AwsEcrImageAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsEcrImageAnchorSchema['properties'],
    parent: AwsEcrImageAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
