import { AAnchor, Anchor, type Filesystem } from '@quadnix/octo';
import type { EfsFilesystemAnchorSchema } from './efs-filesystem.anchor.schema.js';

@Anchor('@octo')
export class EfsFilesystemAnchor extends AAnchor<EfsFilesystemAnchorSchema, Filesystem> {
  declare properties: EfsFilesystemAnchorSchema['properties'];

  constructor(anchorId: string, properties: EfsFilesystemAnchorSchema['properties'], parent: Filesystem) {
    super(anchorId, properties, parent);
  }
}
