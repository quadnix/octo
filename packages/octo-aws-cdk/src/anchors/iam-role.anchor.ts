import { AAnchor, Anchor, IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsServer } from '../models/server/aws.server.model.js';

interface IIamRoleAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      iamRoleName: string;
    }
  > {}

@Anchor()
export class IamRoleAnchor extends AAnchor {
  declare properties: IIamRoleAnchorProperties;

  constructor(anchorId: string, properties: IIamRoleAnchorProperties, parent: AwsServer) {
    super(anchorId, properties, parent);
  }
}
