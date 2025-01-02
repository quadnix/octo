import { AAnchor, Anchor, BaseAnchorSchema, Schema, type Server } from '@quadnix/octo';

class AwsIamRoleAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<{
    iamRoleName: string;
  }>();
}

@Anchor('@octo')
export class AwsIamRoleAnchor extends AAnchor<AwsIamRoleAnchorSchema, Server> {
  declare properties: AwsIamRoleAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsIamRoleAnchorSchema['properties'], parent: Server) {
    super(anchorId, properties, parent);
  }
}
