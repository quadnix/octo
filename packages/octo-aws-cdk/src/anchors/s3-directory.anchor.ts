import { AAnchor, Anchor } from '@quadnix/octo';
import type { S3StorageService } from '../models/service/s3-storage/s3-storage.service.model.js';

@Anchor()
export class S3DirectoryAnchor extends AAnchor {
  constructor(anchorId: string, parent: S3StorageService) {
    super(anchorId, parent);
  }
}
