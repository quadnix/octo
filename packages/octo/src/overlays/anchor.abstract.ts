import { UnknownModel } from '../app.type.js';
import { IAnchor } from './anchor.interface.js';

export abstract class AAnchor {
  protected constructor(readonly anchorId: string, private readonly parent: UnknownModel) {
    if (parent.getAnchor(this.anchorId)) {
      throw new Error('Anchor already exists!');
    }
  }

  getParent(): UnknownModel {
    return this.parent;
  }

  synth(): IAnchor {
    return {
      anchorId: this.anchorId,
      parent: { context: this.parent.getContext() },
    };
  }

  static async unSynth(
    deserializationClass: any,
    anchor: IAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<AAnchor> {
    const parent = await deReferenceContext(anchor.parent.context);
    const newAnchor = parent.getAnchor(anchor.anchorId);
    if (!newAnchor) {
      return new deserializationClass(anchor.anchorId, parent);
    }
    return newAnchor;
  }
}
