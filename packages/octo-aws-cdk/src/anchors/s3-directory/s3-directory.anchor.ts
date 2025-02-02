import { AAnchor, Anchor, type Service } from '@quadnix/octo';
import type { S3DirectoryAnchorSchema } from './s3-directory.anchor.schema.js';

@Anchor('@octo')
export class S3DirectoryAnchor extends AAnchor<S3DirectoryAnchorSchema, Service> {
  declare properties: S3DirectoryAnchorSchema['properties'];

  constructor(anchorId: string, properties: S3DirectoryAnchorSchema['properties'], parent: Service) {
    super(anchorId, properties, parent);
  }
}
