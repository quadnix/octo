import { AAnchor, Anchor } from '@quadnix/octo';
import { AwsServer } from '../models/server/aws.server.model.js';

@Anchor()
export class IamRoleAnchor extends AAnchor {
  constructor(anchorId: string, parent: AwsServer) {
    super(anchorId, parent);
  }
}
