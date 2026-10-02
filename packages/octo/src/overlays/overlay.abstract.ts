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
 * The base class of every overlay - a model that spans other models.
 *
 * Some infrastructure belongs to no single model. Mounting a filesystem into a subnet, for instance,
 * is a fact about both, and forcing it into either one distorts that model. An overlay holds that
 * fact instead, keeping the models it joins clean.
 *
 * An overlay takes {@link AAnchor}s rather than models, so it depends on the shape of what it joins
 * and not on another library's classes. Otherwise it behaves like any other model: it has actions,
 * it is diffed, and it is serialized.
 *
 * @example
 * ```ts
 * @Overlay<MyOverlay>('@example', 'my-overlay', MyOverlaySchema)
 * export class MyOverlay extends AOverlay<MyOverlaySchema, MyOverlay> { ... }
 * ```
 *
 * @group Overlays
 *
 * @see Definition of [Overlays](/docs/fundamentals/overlays).
 */
export abstract class AOverlay<S extends BaseOverlaySchema, T extends UnknownOverlay>
  extends AModel<S, T>
  implements IOverlay<S, T>
{
  /**
   * @param overlayId The ID of the overlay, unique across the infrastructure.
   * @param properties The properties of the overlay.
   * @param anchors The anchors this overlay joins. Each one creates a dependency on its parent model.
   */
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

  /**
   * @internal
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
          throw new NodeUnsynthError('Cannot find anchor while restoring overlay!', overlay.overlayId);
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

  /**
   * @internal
   */
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

  /**
   * @internal
   */
  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const anchorDiffs = await this.diffAnchors();
    diffs.push(...anchorDiffs);

    const propertyDiffs = await this.diffProperties();
    diffs.push(...propertyDiffs);

    return diffs;
  }

  /**
   * @internal
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
   * @internal
   */
  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  /**
   * To get one of the anchors this overlay joins. Unlike {@link AModel.getAnchor}, `parent` is
   * required - an overlay's anchors are always declared by another model.
   */
  override getAnchor(anchorId: string, parent: UnknownModel): UnknownAnchor | undefined {
    return super.getAnchor(anchorId, parent);
  }

  /**
   * The position of one of the joined anchors. See {@link AOverlay.getAnchor}.
   */
  override getAnchorIndex(anchorId: string, parent: UnknownModel): number {
    return super.getAnchorIndex(anchorId, parent);
  }

  /**
   * To stop joining an anchor, which also drops this overlay's dependency on the anchor's parent.
   * - The dependency survives while another joined anchor still shares that parent.
   */
  override removeAnchor(anchor: MatchingAnchor<BaseAnchorSchema> | UnknownAnchor): void {
    anchor = anchor instanceof MatchingAnchor ? anchor.getActual() : anchor;
    const anchorParent = anchor.getParent();

    super.removeAnchor(anchor);

    // Keep the dependency while another joined anchor is still parented by the same model.
    if (this.getAnchors().some((a) => a.getParent().getContext() === anchorParent.getContext())) {
      return;
    }

    const overlayParentDependencyIndex = this.getDependencies().findIndex(
      (d) => d.to.getContext() === anchorParent.getContext(),
    );
    if (overlayParentDependencyIndex > -1) {
      this.removeDependency(overlayParentDependencyIndex);
    }
    const parentOverlayDependencyIndex = anchorParent
      .getDependencies()
      .findIndex((d) => d.to.getContext() === this.getContext());
    if (parentOverlayDependencyIndex > -1) {
      anchorParent.removeDependency(parentOverlayDependencyIndex);
    }
  }

  /**
   * @internal
   */
  override setContext(): string {
    const nodePackage = (this.constructor as typeof AOverlay).NODE_PACKAGE;
    const nodeName = (this.constructor as typeof AOverlay).NODE_NAME;
    return `${nodePackage}/${nodeName}=${this.overlayId}`;
  }

  /**
   * @internal
   */
  override synth(): S {
    return {
      anchors: this.getAnchors().map((a) => a.synth()),
      overlayId: this.overlayId,
      properties: JSON.parse(JSON.stringify(this.properties)),
    } as S;
  }
}
