import { AAnchor, Anchor } from '@quadnix/octo';
import type { SubnetLocalFilesystemMountAnchorSchema } from './subnet-local-filesystem-mount.anchor.schema.js';

@Anchor('@octo')
export class SubnetLocalFilesystemMountAnchor extends AAnchor<
  SubnetLocalFilesystemMountAnchorSchema,
  SubnetLocalFilesystemMountAnchorSchema['parentInstance']
> {
  declare properties: SubnetLocalFilesystemMountAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: SubnetLocalFilesystemMountAnchorSchema['properties'],
    parent: SubnetLocalFilesystemMountAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
