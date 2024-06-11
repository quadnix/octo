import { AAnchor, Anchor, IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsServer } from '../models/server/aws.server.model.js';

interface IIamUserAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      iamUserName: string;
    }
  > {}

@Anchor()
export class IamUserAnchor extends AAnchor {
  declare properties: IIamUserAnchorProperties;

  constructor(anchorId: string, properties: IIamUserAnchorProperties, parent: AwsServer) {
    super(anchorId, properties, parent);
  }
}
