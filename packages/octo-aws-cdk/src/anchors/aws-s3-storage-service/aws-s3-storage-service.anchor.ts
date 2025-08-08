import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsS3StorageServiceAnchorSchema } from './aws-s3-storage-service.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsS3StorageServiceAnchor extends AAnchor<
  AwsS3StorageServiceAnchorSchema,
  AwsS3StorageServiceAnchorSchema['parentInstance']
> {
  declare properties: AwsS3StorageServiceAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsS3StorageServiceAnchorSchema['properties'],
    parent: AwsS3StorageServiceAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
