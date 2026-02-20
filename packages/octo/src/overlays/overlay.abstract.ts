import {
  type AnchorSchema,
  MatchingAnchor,
  type OverlaySchema,
  type UnknownAnchor,
  type UnknownModel,
  type UnknownOverlay,
} from '../app.type.js';
import { ModelError, NodeUnsynthError } from '../errors/index.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { AModel } from '../models/model.abstract.js';
import type { BaseAnchorSchema } from './anchor.schema.js';
import type { IOverlay } from './overlay.interface.js';
import type { BaseOverlaySchema } from './overlay.schema.js';

/**
 * The abstract base class for all Octo overlays.
 *
 * An overlay is a special kind of model that represents infrastructure
 * functionality spanning across multiple models — for example, mounting a
 * filesystem to a subnet. Unlike regular models, overlays are constructed from
 * *anchors* (the public representatives of models) rather than from models
 * directly, keeping model implementations decoupled.
 *
 * To create a custom overlay, extend this class and apply the {@link Overlay} decorator:
 * ```ts
 * @Overlay('@my-package', 'my-overlay', MyOverlaySchema)
 * export class MyOverlay extends AOverlay<MyOverlaySchema, MyOverlay> {
 *   constructor(
 *     overlayId: string,
 *     properties: MyOverlaySchema['properties'],
 *     anchors: [MyAnchor],
 *   ) {
 *     super(overlayId, properties, anchors);
 *   }
 * }
 * ```
 *
 * @group Overlays
 * @see {@link Overlay} decorator
 * @see [Fundamentals: Overlays](/docs/fundamentals/overlays)
 */
export abstract class AOverlay<S extends BaseOverlaySchema, T extends UnknownOverlay>
  extends AModel<S, T>
  implements IOverlay<S, T>
{
  protected constructor(
    readonly overlayId: S['overlayId'],
    readonly properties: S['properties'],
    anchors: (MatchingAnchor<BaseAnchorSchema> | UnknownAnchor)[],
  ) {
    super();

    for (const anchor of anchors) {
      this.addAnchor(anchor);
    }
  }

  override addAnchor(anchor: MatchingAnchor<BaseAnchorSchema> | UnknownAnchor): void {
    super.addAnchor(anchor);

    const anchorParent = anchor instanceof MatchingAnchor ? anchor.getActual().getParent() : anchor.getParent();
    const anchorParentField = anchorParent.deriveDependencyField();
    if (!anchorParentField) {
      throw new ModelError('Cannot derive anchor parent field!', this);
    }

    if (anchorParentField === 'overlayId' && anchorParent.overlayId === this.overlayId) {
      throw new ModelError('Cannot add anchor to an overlay pointing to itself!', this);
    }

    const { thisToThatDependency } = this.addRelationship(anchorParent);
    const { thisToThatDependency: thatToThisDependency } = anchorParent.addRelationship(this);
    thisToThatDependency.addBehavior('overlayId', DiffAction.ADD, anchorParentField, DiffAction.ADD);
    thisToThatDependency.addBehavior('overlayId', DiffAction.ADD, anchorParentField, DiffAction.UPDATE);
    thatToThisDependency.addBehavior(anchorParentField, DiffAction.DELETE, 'overlayId', DiffAction.DELETE);
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const anchorDiffs = await this.diffAnchors();
    diffs.push(...anchorDiffs);

    const propertyDiffs = await this.diffProperties();
    diffs.push(...propertyDiffs);

    return diffs;
  }

  /**
   * Computes anchor-level diffs for this overlay.
   *
   * Called by the transaction engine as part of {@link AOverlay.diff}.
   * The default implementation emits an `ADD` diff for every anchor currently
   * attached to this overlay, which triggers overlay actions that react to
   * anchor additions. Override this method when you need custom diff logic —
   * for example, to emit `UPDATE` diffs when anchor properties change.
   *
   * @returns An array of anchor {@link Diff} objects.
   */
  async diffAnchors(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const currentAnchors = this.getAnchors();
    for (const currentAnchor of currentAnchors) {
      diffs.push(new Diff(this, DiffAction.ADD, 'anchor', currentAnchor));
    }

    return diffs;
  }

  /**
   * Returns property-level diffs for this overlay.
   *
   * The base implementation returns an empty array. Override when individual
   * overlay properties should drive update actions.
   *
   * @returns An array of property {@link Diff} objects.
   */
  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override getAnchor(anchorId: string, parent: UnknownModel): UnknownAnchor | undefined {
    return super.getAnchor(anchorId, parent);
  }

  override getAnchorIndex(anchorId: string, parent: UnknownModel): number {
    return super.getAnchorIndex(anchorId, parent);
  }

  override removeAnchor(anchor: MatchingAnchor<BaseAnchorSchema> | UnknownAnchor): void {
    anchor = anchor instanceof MatchingAnchor ? anchor.getActual() : anchor;

    const overlayParentDependencyIndex = this.getDependencies().findIndex(
      (d) => d.to.getContext() === anchor.getParent().getContext(),
    );
    if (overlayParentDependencyIndex > -1) {
      this.removeDependency(overlayParentDependencyIndex);
    }
    const parentOverlayDependencyIndex = anchor
      .getParent()
      .getDependencies()
      .findIndex((d) => d.to.getContext() === this.getContext());
    if (parentOverlayDependencyIndex > -1) {
      anchor.getParent().removeDependency(parentOverlayDependencyIndex);
    }

    super.removeAnchor(anchor);
  }

  /**
   * Returns the unique context string for this overlay instance.
   *
   * The format is `{package}/{overlayName}={overlayId}`, e.g. `@octo/filesystem-mount=mount-1`.
   * This string is used by Octo to identify and track overlay instances across runs.
   *
   * @returns The overlay's unique context string.
   */
  override setContext(): string {
    const nodePackage = (this.constructor as typeof AOverlay).NODE_PACKAGE;
    const nodeName = (this.constructor as typeof AOverlay).NODE_NAME;
    return `${nodePackage}/${nodeName}=${this.overlayId}`;
  }

  /**
   * Serialises the overlay to a plain-object schema suitable for JSON persistence.
   *
   * The returned object contains `overlayId`, `properties`, and the serialised anchors.
   * It is called on every run to capture the state of the overlay graph.
   *
   * @returns A schema object representing this overlay's current state.
   */
  override synth(): S {
    return {
      anchors: this.getAnchors().map((a) => a.synth()),
      overlayId: this.overlayId,
      properties: JSON.parse(JSON.stringify(this.properties)),
    } as S;
  }

  /**
   * Reconstructs an overlay instance from its serialised schema
   * (the inverse of {@link AOverlay.synth}).
   *
   * Resolves each anchor reference via `deReferenceContext` before constructing
   * the overlay so that anchor–model relationships are restored correctly.
   *
   * @param deserializationClass The concrete overlay class to instantiate.
   * @param overlay The serialised overlay schema.
   * @param deReferenceContext Callback to resolve models by context string.
   * @returns The reconstructed overlay instance.
   */
  static override async unSynth(
    deserializationClass: any,
    overlay: OverlaySchema<UnknownOverlay>,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<UnknownOverlay> {
    const anchors = await Promise.all(
      overlay.anchors.map(async (a: AnchorSchema<UnknownAnchor>): Promise<UnknownAnchor> => {
        const parent = await deReferenceContext(a.parent.context);
        const anchor = parent.getAnchor(a.anchorId);
        if (!anchor) {
          throw new NodeUnsynthError('Cannot find anchor while deserializing overlay!', overlay.overlayId);
        }
        return anchor as UnknownAnchor;
      }),
    );

    const newOverlay: UnknownOverlay = new deserializationClass(overlay.overlayId, overlay.properties, []);
    for (const anchor of anchors) {
      newOverlay['anchors'].push(anchor);
    }
    return newOverlay;
  }
}
