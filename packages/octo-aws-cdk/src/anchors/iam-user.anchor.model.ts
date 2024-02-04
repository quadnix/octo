import { AAnchor, Anchor, UnknownModel } from '@quadnix/octo';

@Anchor()
export class IamUserAnchor extends AAnchor {
  constructor(anchorId: string, parent: UnknownModel) {
    super(anchorId, parent);
  }
}
