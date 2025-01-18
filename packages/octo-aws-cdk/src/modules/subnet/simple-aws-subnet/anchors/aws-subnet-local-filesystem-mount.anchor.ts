import { AAnchor, Anchor, BaseAnchorSchema, Schema, type Subnet } from '@quadnix/octo';

class AwsSubnetLocalFilesystemMountAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<Record<never, never>>();
}

@Anchor('@octo')
export class AwsSubnetLocalFilesystemMountAnchor extends AAnchor<AwsSubnetLocalFilesystemMountAnchorSchema, Subnet> {
  declare properties: AwsSubnetLocalFilesystemMountAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsSubnetLocalFilesystemMountAnchorSchema['properties'], parent: Subnet) {
    super(anchorId, properties, parent);
  }
}
