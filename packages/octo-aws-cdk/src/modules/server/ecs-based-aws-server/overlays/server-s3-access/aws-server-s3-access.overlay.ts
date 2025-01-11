import { AAnchor, AOverlay, type Diff, Overlay, type Service } from '@quadnix/octo';
import type { AwsIamRoleAnchor } from '../../anchors/aws-iam-role.anchor.js';
import type { AwsS3DirectoryAnchorSchema } from '../../aws-server.module.js';
import { AwsServerS3AccessSchema } from './aws-server-s3-access.schema.js';

@Overlay('@octo', 'server-s3-access-overlay', AwsServerS3AccessSchema)
export class AwsServerS3AccessOverlay extends AOverlay<AwsServerS3AccessSchema, AwsServerS3AccessOverlay> {
  declare properties: AwsServerS3AccessSchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsServerS3AccessSchema['properties'],
    anchors: [AwsIamRoleAnchor, AAnchor<AwsS3DirectoryAnchorSchema, Service>],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
