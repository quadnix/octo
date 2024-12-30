import { AAnchor, Anchor, BaseAnchorSchema, Filesystem, Schema } from '@quadnix/octo';

class AwsFilesystemAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<Record<never, never>>();
}

@Anchor('@octo')
export class AwsFilesystemAnchor extends AAnchor<AwsFilesystemAnchorSchema, Filesystem> {
  declare properties: AwsFilesystemAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsFilesystemAnchorSchema['properties'], parent: Filesystem) {
    super(anchorId, properties, parent);
  }
}
