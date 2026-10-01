import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsServerAnchor } from '../../../../../anchors/aws-server/aws-server.anchor.js';
import { AwsServerS3AccessOverlaySchema } from './aws-server-s3-access.schema.js';

/**
 * A server's grant to one access prefix of an S3 bucket. It creates nothing: the execution running the
 * server reads it and grants the access to the role it creates.
 *
 * @internal
 */
@Overlay('@octo', 'aws-server-s3-access-overlay', AwsServerS3AccessOverlaySchema)
export class AwsServerS3AccessOverlay extends AOverlay<AwsServerS3AccessOverlaySchema, AwsServerS3AccessOverlay> {
  declare anchors: [AwsServerAnchor, MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>];
  declare properties: AwsServerS3AccessOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsServerS3AccessOverlaySchema['properties'],
    anchors: [AwsServerAnchor, MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>],
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
