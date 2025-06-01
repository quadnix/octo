import { AAnchor, Anchor } from '@quadnix/octo';
import type { S3DirectoryAnchorSchema } from './s3-directory.anchor.schema.js';

@Anchor('@octo')
export class S3DirectoryAnchor extends AAnchor<S3DirectoryAnchorSchema, S3DirectoryAnchorSchema['parentInstance']> {
  declare properties: S3DirectoryAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: S3DirectoryAnchorSchema['properties'],
    parent: S3DirectoryAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
