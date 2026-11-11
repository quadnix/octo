import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsLambdaFunctionAnchorSchema } from '../../../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import type { AwsServerAnchor } from '../../../../../anchors/aws-server/aws-server.anchor.js';
import { AwsServerLambdaAccessOverlaySchema } from './aws-server-lambda-access.schema.js';

/**
 * A server's grant to invoke one Lambda function. It creates nothing: the execution running the
 * server reads it and grants the invocation to the role it creates.
 *
 * @internal
 */
@Overlay('@octo', 'aws-server-lambda-access-overlay', AwsServerLambdaAccessOverlaySchema, { createsNothing: true })
export class AwsServerLambdaAccessOverlay extends AOverlay<
  AwsServerLambdaAccessOverlaySchema,
  AwsServerLambdaAccessOverlay
> {
  declare anchors: [AwsServerAnchor, MatchingAnchor<AwsLambdaFunctionAnchorSchema>];
  declare properties: AwsServerLambdaAccessOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsServerLambdaAccessOverlaySchema['properties'],
    anchors: [AwsServerAnchor, MatchingAnchor<AwsLambdaFunctionAnchorSchema>],
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
