import { AAnchor, Anchor, type Subnet } from '@quadnix/octo';
import type { SubnetLocalFilesystemMountAnchorSchema } from './subnet-local-filesystem-mount.anchor.schema.js';

@Anchor('@octo')
export class SubnetLocalFilesystemMountAnchor extends AAnchor<SubnetLocalFilesystemMountAnchorSchema, Subnet> {
  declare properties: SubnetLocalFilesystemMountAnchorSchema['properties'];

  constructor(anchorId: string, properties: SubnetLocalFilesystemMountAnchorSchema['properties'], parent: Subnet) {
    super(anchorId, properties, parent);
  }
}
