import { AAnchor, Anchor, IAnchor, ModifyInterface } from '@quadnix/octo';
import type { S3StorageService } from '../models/service/s3-storage/s3-storage.service.model.js';

interface IS3DirectoryAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      allowRead: boolean;
      allowWrite: boolean;
      bucketName: string;
      remoteDirectoryPath: string;
    }
  > {}

@Anchor('@octo')
export class S3DirectoryAnchor extends AAnchor {
  declare properties: IS3DirectoryAnchorProperties;

  constructor(anchorId: string, properties: IS3DirectoryAnchorProperties, parent: S3StorageService) {
    super(anchorId, properties, parent);
  }
}
