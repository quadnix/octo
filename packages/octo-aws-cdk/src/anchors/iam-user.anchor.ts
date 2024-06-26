import { AAnchor, Anchor } from '@quadnix/octo';
import type { AwsServer } from '../models/server/aws.server.model.js';

@Anchor()
export class IamUserAnchor extends AAnchor {
  constructor(anchorId: string, parent: AwsServer) {
    super(anchorId, parent);
  }
}
