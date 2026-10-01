import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsServerAnchor } from '../../../../../anchors/aws-server/aws-server.anchor.js';
import { AwsServerDynamoDBAccessOverlaySchema } from './aws-server-dynamodb-access.schema.js';

/**
 * A server's grant to one DynamoDB table. It creates nothing: the execution running the
 * server reads it and grants the access to the role it creates.
 *
 * @internal
 */
@Overlay('@octo', 'aws-server-dynamodb-access-overlay', AwsServerDynamoDBAccessOverlaySchema)
export class AwsServerDynamoDBAccessOverlay extends AOverlay<
  AwsServerDynamoDBAccessOverlaySchema,
  AwsServerDynamoDBAccessOverlay
> {
  declare anchors: [AwsServerAnchor, MatchingAnchor<AwsDynamoDBAnchorSchema>];
  declare properties: AwsServerDynamoDBAccessOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsServerDynamoDBAccessOverlaySchema['properties'],
    anchors: [AwsServerAnchor, MatchingAnchor<AwsDynamoDBAnchorSchema>],
  ) {
    super(overlayId, properties, anchors);
  }

  /**
   * @internal
   */
  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
