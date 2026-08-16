import type { AnchorSchema, UnknownAnchor, UnknownModel } from '../app.type.js';
import type { ANode } from '../functions/node/node.abstract.js';
import type { IAnchor } from './anchor.interface.js';
import type { BaseAnchorSchema } from './anchor.schema.js';

/**
 * The base class of every anchor - a model's public face.
 *
 * A model is an implementation detail of the library that defines it, and other libraries should not
 * depend on its class. An anchor is what a model exposes instead: a small, named set of properties
 * that other modules match on, using {@link AModel.getAnchorsMatchingSchema}. That indirection is what
 * lets a model change without breaking its consumers.
 *
 * Anchors are also the inputs an {@link AOverlay} joins together.
 *
 * @example
 * ```ts
 * @Anchor('@example')
 * export class MyAnchor extends AAnchor<MyAnchorSchema, MyModel> { ... }
 * ```
 *
 * @group Overlays
 *
 * @see Definition of [Anchors](/docs/fundamentals/anchors).
 */
export abstract class AAnchor<S extends BaseAnchorSchema, T extends UnknownModel> implements IAnchor<S, T> {
  /**
   * The package of the anchor.
   */
  static readonly NODE_PACKAGE: string;

  /**
   * @param anchorId The ID of the anchor, unique within its parent.
   * @param properties The properties this anchor exposes to whoever matches on it.
   * @param parent The model declaring the anchor.
   */
  protected constructor(
    readonly anchorId: S['anchorId'],
    readonly properties: S['properties'],
    private readonly parent: T,
  ) {}

  /**
   * @internal
   */
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
      newAnchor.properties[key] = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }
    return newAnchor;
  }

  /**
   * The model that declared this anchor.
   */
  getParent(): T {
    return this.parent;
  }

  /**
   * @internal
   */
  synth(): S {
    return {
      anchorId: this.anchorId,
      parent: { context: this.parent.getContext(), type: (this.parent.constructor as typeof ANode).NODE_TYPE },
      properties: JSON.parse(JSON.stringify(this.properties)),
    } as S;
  }
}
