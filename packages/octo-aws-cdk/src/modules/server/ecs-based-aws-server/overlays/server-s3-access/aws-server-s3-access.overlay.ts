import { AOverlay, type Diff, MatchingAnchor, Overlay } from '@quadnix/octo';
import type { IamRoleAnchor } from '../../../../../anchors/iam-role/iam-role.anchor.js';
import type { S3DirectoryAnchorSchema } from '../../../../../anchors/s3-directory/s3-directory.anchor.schema.js';
import { AwsServerS3AccessSchema } from './aws-server-s3-access.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'server-s3-access-overlay', AwsServerS3AccessSchema)
export class AwsServerS3AccessOverlay extends AOverlay<AwsServerS3AccessSchema, AwsServerS3AccessOverlay> {
  declare anchors: [IamRoleAnchor, MatchingAnchor<S3DirectoryAnchorSchema>];
  declare properties: AwsServerS3AccessSchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsServerS3AccessSchema['properties'],
    anchors: [IamRoleAnchor, MatchingAnchor<S3DirectoryAnchorSchema>],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
