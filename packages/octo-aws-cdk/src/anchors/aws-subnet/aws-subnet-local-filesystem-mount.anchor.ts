import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsSubnetLocalFilesystemMountAnchorSchema } from './aws-subnet-local-filesystem-mount.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class AwsSubnetLocalFilesystemMountAnchor extends AAnchor<
  AwsSubnetLocalFilesystemMountAnchorSchema,
  AwsSubnetLocalFilesystemMountAnchorSchema['parentInstance']
> {
  declare properties: AwsSubnetLocalFilesystemMountAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsSubnetLocalFilesystemMountAnchorSchema['properties'],
    parent: AwsSubnetLocalFilesystemMountAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
