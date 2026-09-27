import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from './aws-s3-storage-service-access-prefix.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsS3StorageServiceAccessPrefixAnchor extends AAnchor<
  AwsS3StorageServiceAccessPrefixAnchorSchema,
  AwsS3StorageServiceAccessPrefixAnchorSchema['parentInstance']
> {
  declare properties: AwsS3StorageServiceAccessPrefixAnchorSchema['properties'];

  /**
   * @internal
   */
  constructor(
    anchorId: string,
    properties: AwsS3StorageServiceAccessPrefixAnchorSchema['properties'],
    parent: AwsS3StorageServiceAccessPrefixAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
