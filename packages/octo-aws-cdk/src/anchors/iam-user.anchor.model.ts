import { Anchor, IAnchor, Model } from '@quadnix/octo';

export class IamUserAnchor extends Anchor {
  readonly ANCHOR_NAME: string;

  constructor(anchorName: string, parent: Model<unknown, unknown>) {
    super(parent);
    this.ANCHOR_NAME = anchorName;
  }

  static override async unSynth(
    anchor: IAnchor,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<IamUserAnchor> {
    const parent = await deReferenceContext(anchor.parent);
    return new IamUserAnchor(anchor.name, parent);
  }
}
