import type { AnchorSchema, UnknownAnchor, UnknownModel } from '../app.type.js';
import type { IAnchor } from './anchor.interface.js';
import type { BaseAnchorSchema } from './anchor.schema.js';

export abstract class AAnchor<S extends BaseAnchorSchema, T extends UnknownModel> implements IAnchor<S, T> {
  /**
   * The package of the anchor.
   */
  static readonly NODE_PACKAGE: string;

  protected constructor(
    readonly anchorId: S['anchorId'],
    readonly properties: S['properties'],
    private readonly parent: T,
  ) {}

  getParent(): T {
    return this.parent;
  }

  synth(): S {
    return {
      anchorId: this.anchorId,
      parent: { context: this.parent.getContext() },
      properties: JSON.parse(JSON.stringify(this.properties)),
    } as S;
  }

  static async unSynth(
    deserializationClass: any,
    anchor: AnchorSchema<UnknownAnchor>,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<UnknownAnchor> {
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
