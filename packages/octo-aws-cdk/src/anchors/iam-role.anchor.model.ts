import { Anchor, IAnchor, Model } from '@quadnix/octo';

export class IamRoleAnchor extends Anchor {
  readonly ANCHOR_NAME: string;

  constructor(anchorName: string, parent: Model<unknown, unknown>) {
    super(parent);
    this.ANCHOR_NAME = anchorName;
  }

  static override async unSynth(
    anchor: IAnchor,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<IamRoleAnchor> {
    const parent = await deReferenceContext(anchor.parent);
    return new IamRoleAnchor(anchor.name, parent);
  }
}
