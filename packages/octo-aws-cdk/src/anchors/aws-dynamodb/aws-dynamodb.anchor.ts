import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from './aws-dynamodb.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsDynamoDBAnchor extends AAnchor<AwsDynamoDBAnchorSchema, AwsDynamoDBAnchorSchema['parentInstance']> {
  declare properties: AwsDynamoDBAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsDynamoDBAnchorSchema['properties'],
    parent: AwsDynamoDBAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
