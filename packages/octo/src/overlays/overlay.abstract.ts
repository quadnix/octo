import { ModelType, type UnknownModel, type UnknownOverlay } from '../app.type.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { AModel } from '../models/model.abstract.js';
import { type AAnchor } from './anchor.abstract.js';
import type { IOverlay } from './overlay.interface.js';

export abstract class AOverlay<T> extends AModel<IOverlay, T> {
  abstract override readonly MODEL_NAME: string;
  override readonly MODEL_TYPE: ModelType = ModelType.OVERLAY;

  protected constructor(
    readonly overlayId: IOverlay['overlayId'],
    readonly properties: IOverlay['properties'],
    anchors: AAnchor[],
  ) {
    super();

    for (const anchor of anchors) {
      this.addAnchor(anchor);
    }
  }

  override addAnchor(anchor: AAnchor): void {
    try {
      super.addAnchor(anchor);
    } catch (error) {
      if (error.message !== 'Anchor already exists!') {
        throw error;
      }
    }

    const { thisToThatDependency, thatToThisDependency } = this.addRelationship(anchor.getParent());
    thisToThatDependency.addBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.ADD);
    thisToThatDependency.addBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.UPDATE);
    thatToThisDependency.addBehavior('MODEL_NAME', DiffAction.DELETE, 'overlayId', DiffAction.DELETE);
  }

  override async diff(previous: T): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = await this.diffProperties(previous);
    diffs.push(...propertyDiffs);

    // Anchor diffs.
    const deletedAnchors = (previous as unknown as UnknownOverlay)
      .getAnchors()
      .filter((p) => this.getAnchorIndex(p.anchorId, p.getParent()) === -1);
    for (const anchor of deletedAnchors) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'anchor', anchor));
    }
    const newAnchors = this.getAnchors().filter(
      (c) => (previous as unknown as UnknownOverlay).getAnchorIndex(c.anchorId, c.getParent()) === -1,
    );
    for (const anchor of newAnchors) {
      diffs.push(new Diff(this, DiffAction.ADD, 'anchor', anchor));
    }

    return diffs;
  }

  override async diffProperties(previous: T): Promise<Diff[]> {
    return DiffUtility.diffObject(previous as unknown as UnknownOverlay, this, 'properties');
  }

  override getAnchor(anchorId: string, parent: UnknownModel): AAnchor | undefined {
    return super.getAnchor(anchorId, parent);
  }

  override getAnchorIndex(anchorId: string, parent: UnknownModel): number {
    return super.getAnchorIndex(anchorId, parent);
  }

  override getContext(): string {
    return `${this.MODEL_NAME}=${this.overlayId}`;
  }

  override removeAnchor(anchor: AAnchor): void {
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

  override synth(): IOverlay {
    return {
      anchors: this.getAnchors().map((a) => a.synth()),
      overlayId: this.overlayId,
      properties: JSON.parse(JSON.stringify(this.properties)),
    };
  }

  static override async unSynth(
    deserializationClass: any,
    overlay: IOverlay,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<UnknownOverlay> {
    const anchors = await Promise.all(
      overlay.anchors.map(async (a): Promise<AAnchor> => {
        const parent = await deReferenceContext(a.parent.context);
        const anchor = parent.getAnchor(a.anchorId);
        if (!anchor) {
          throw new Error('Cannot find anchor while deserializing overlay!');
        }
        return anchor;
      }),
    );

    return new deserializationClass(overlay.overlayId, overlay.properties, anchors);
  }
}
