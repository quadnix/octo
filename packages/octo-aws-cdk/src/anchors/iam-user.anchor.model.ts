import { AAnchor, Anchor, IAnchor, UnknownModel } from '@quadnix/octo';

@Anchor()
export class IamUserAnchor extends AAnchor {
  readonly ANCHOR_NAME: string;

  constructor(anchorName: string, parent: UnknownModel) {
    super(parent);
    this.ANCHOR_NAME = anchorName;
  }

  static override async unSynth(
    anchor: IAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<IamUserAnchor> {
    const parent = await deReferenceContext(anchor.parent);
    return new IamUserAnchor(anchor.name, parent);
  }
}
