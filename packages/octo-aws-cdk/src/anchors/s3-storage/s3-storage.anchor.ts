import { AAnchor, Anchor, type Service } from '@quadnix/octo';
import type { S3StorageAnchorSchema } from './s3-storage.anchor.schema.js';

@Anchor('@octo')
export class S3StorageAnchor extends AAnchor<S3StorageAnchorSchema, Service> {
  declare properties: S3StorageAnchorSchema['properties'];

  constructor(anchorId: string, properties: S3StorageAnchorSchema['properties'], parent: Service) {
    super(anchorId, properties, parent);
  }
}
