import type { UnknownModel } from '../app.type.js';
import type { IAnchor } from './anchor.interface.js';

export abstract class AAnchor {
  protected constructor(
    readonly anchorId: string,
    readonly properties: IAnchor['properties'],
    private readonly parent: UnknownModel,
  ) {}

  getParent(): UnknownModel {
    return this.parent;
  }

  synth(): IAnchor {
    return {
      anchorId: this.anchorId,
      parent: { context: this.parent.getContext() },
      properties: JSON.parse(JSON.stringify(this.properties)),
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
      return new deserializationClass(anchor.anchorId, anchor.properties, parent);
    }

    for (const [key, value] of Object.entries(anchor.properties)) {
      newAnchor.properties[key] = JSON.parse(JSON.stringify(value));
    }
    return newAnchor;
  }
}
