import { AAnchor, Anchor, BaseAnchorSchema, Schema, Subnet } from '@quadnix/octo';

class AwsSubnetFilesystemMountAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<Record<never, never>>();
}

@Anchor('@octo')
export class AwsSubnetFilesystemMountAnchor extends AAnchor<AwsSubnetFilesystemMountAnchorSchema, Subnet> {
  declare properties: AwsSubnetFilesystemMountAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsSubnetFilesystemMountAnchorSchema['properties'], parent: Subnet) {
    super(anchorId, properties, parent);
  }
}
