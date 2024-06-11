import { AAnchor, Anchor, IAnchor, ModifyInterface } from '@quadnix/octo';
import type { S3StorageService } from '../models/service/s3-storage/s3-storage.service.model.js';

interface IS3DirectoryAnchorProperties extends ModifyInterface<IAnchor['properties'], Record<string, never>> {}

@Anchor()
export class S3DirectoryAnchor extends AAnchor {
  declare properties: IS3DirectoryAnchorProperties;

  constructor(anchorId: string, properties: IS3DirectoryAnchorProperties, parent: S3StorageService) {
    super(anchorId, properties, parent);
  }
}
