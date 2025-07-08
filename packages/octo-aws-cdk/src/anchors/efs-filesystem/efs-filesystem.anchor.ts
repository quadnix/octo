import { AAnchor, Anchor } from '@quadnix/octo';
import type { EfsFilesystemAnchorSchema } from './efs-filesystem.anchor.schema.js';

/**
 * @internal
 */
@Anchor('@octo')
export class EfsFilesystemAnchor extends AAnchor<
  EfsFilesystemAnchorSchema,
  EfsFilesystemAnchorSchema['parentInstance']
> {
  declare properties: EfsFilesystemAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: EfsFilesystemAnchorSchema['properties'],
    parent: EfsFilesystemAnchorSchema['parentInstance'],
  ) {
    super(anchorId, properties, parent);
  }
}
