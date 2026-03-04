import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsDynamoDBGlobalAnchorSchema } from './aws-dynamodb-global.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsDynamoDBGlobalAnchor extends AAnchor<
  AwsDynamoDBGlobalAnchorSchema,
  AwsDynamoDBGlobalAnchorSchema['parentInstance']
> {
  declare properties: AwsDynamoDBGlobalAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsDynamoDBGlobalAnchorSchema['properties'],
    parent: AwsDynamoDBGlobalAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
