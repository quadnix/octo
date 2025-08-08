import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsS3StorageServiceDirectoryAnchorSchema } from './aws-s3-storage-service-directory.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsS3StorageServiceDirectoryAnchor extends AAnchor<
  AwsS3StorageServiceDirectoryAnchorSchema,
  AwsS3StorageServiceDirectoryAnchorSchema['parentInstance']
> {
  declare properties: AwsS3StorageServiceDirectoryAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsS3StorageServiceDirectoryAnchorSchema['properties'],
    parent: AwsS3StorageServiceDirectoryAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
