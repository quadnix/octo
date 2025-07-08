import { AAnchor, Anchor } from '@quadnix/octo';
import type { S3StorageAnchorSchema } from './s3-storage.anchor.schema.js';

@Anchor('@octo')
/**
 * @internal
 */
export class S3StorageAnchor extends AAnchor<S3StorageAnchorSchema, S3StorageAnchorSchema['parentInstance']> {
  declare properties: S3StorageAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: S3StorageAnchorSchema['properties'],
    parent: S3StorageAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
