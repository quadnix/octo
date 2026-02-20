import type { AnchorSchema, UnknownAnchor, UnknownModel } from '../app.type.js';
import type { ANode } from '../functions/node/node.abstract.js';
import type { IAnchor } from './anchor.interface.js';
import type { BaseAnchorSchema } from './anchor.schema.js';

/**
 * The abstract base class for all Octo anchors.
 *
 * An anchor is a typed, serialisable representative of a model node. It exposes
 * a subset of the model's properties so that overlays and other modules can consume
 * them without taking a hard dependency on the concrete model class.
 *
 * Anchors are attached to their parent model via {@link AModel.addAnchor} and are
 * typically created inside a module's {@link AModule.onInit} method.
 *
 * To create a custom anchor, extend this class and apply the {@link Anchor} decorator:
 * ```ts
 * @Anchor('@my-package')
 * export class AwsRegionAnchor extends AAnchor<AwsRegionAnchorSchema, AwsRegion> {
 *   constructor(
 *     anchorId: string,
 *     properties: AwsRegionAnchorSchema['properties'],
 *     parent: AwsRegion,
 *   ) {
 *     super(anchorId, properties, parent);
 *   }
 * }
 * ```
 *
 * @group Overlays
 * @see {@link Anchor} decorator
 * @see [Fundamentals: Anchors](/docs/fundamentals/anchors)
 */
export abstract class AAnchor<S extends BaseAnchorSchema, T extends UnknownModel> implements IAnchor<S, T> {
  /**
   * The package name of the anchor, set by the {@link Anchor} decorator.
   */
  static readonly NODE_PACKAGE: string;

  /**
   * @param anchorId A unique identifier for this anchor instance within the parent model.
   * @param properties The typed properties this anchor exposes to consumers.
   * @param parent The model node that owns this anchor.
   */
  protected constructor(
    readonly anchorId: S['anchorId'],
    readonly properties: S['properties'],
    private readonly parent: T,
  ) {}

  /**
   * Returns the model node that owns this anchor.
   *
   * @returns The parent model instance.
   */
  getParent(): T {
    return this.parent;
  }

  /**
   * Serialises the anchor to a plain-object schema suitable for JSON persistence.
   *
   * The returned object contains `anchorId`, `properties`, and a reference to
   * the parent model's context so that it can be re-linked during deserialization.
   *
   * @returns A schema object representing this anchor's current state.
   */
  synth(): S {
    return {
      anchorId: this.anchorId,
      parent: { context: this.parent.getContext(), type: (this.parent.constructor as typeof ANode).NODE_TYPE },
      properties: JSON.parse(JSON.stringify(this.properties)),
    } as S;
  }

  /**
   * Reconstructs an anchor instance from its serialised schema
   * (the inverse of {@link AAnchor.synth}).
   *
   * If the anchor already exists on the parent model (by `anchorId`), its
   * properties are updated in-place and the existing instance is returned.
   * Otherwise a new instance is created.
   *
   * @param deserializationClass The concrete anchor class to instantiate.
   * @param anchor The serialised anchor schema.
   * @param deReferenceContext Callback to resolve the parent model by context string.
   * @returns The reconstructed (or updated) anchor instance.
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
      newAnchor.properties[key] = JSON.parse(JSON.stringify(value));
    }
    return newAnchor;
  }
}
