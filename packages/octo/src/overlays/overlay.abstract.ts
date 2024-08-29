import { NodeType, type UnknownModel, type UnknownOverlay } from '../app.type.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { AModel } from '../models/model.abstract.js';
import { type AAnchor } from './anchor.abstract.js';
import type { IOverlay } from './overlay.interface.js';

export abstract class AOverlay<T> extends AModel<IOverlay, T> {
  abstract override readonly NODE_NAME: string;
  override readonly NODE_TYPE: NodeType = NodeType.OVERLAY;

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
    super.addAnchor(anchor);

    const { thisToThatDependency, thatToThisDependency } = this.addRelationship(anchor.getParent());
    thisToThatDependency.addBehavior('overlayId', DiffAction.ADD, 'NODE_NAME', DiffAction.ADD);
    thisToThatDependency.addBehavior('overlayId', DiffAction.ADD, 'NODE_NAME', DiffAction.UPDATE);
    thatToThisDependency.addBehavior('NODE_NAME', DiffAction.DELETE, 'overlayId', DiffAction.DELETE);
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const anchorDiffs = await this.diffAnchors();
    diffs.push(...anchorDiffs);

    const propertyDiffs = await this.diffProperties();
    diffs.push(...propertyDiffs);

    return diffs;
  }

  async diffAnchors(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const currentAnchors = this.getAnchors();
    for (const currentAnchor of currentAnchors) {
      diffs.push(new Diff(this, DiffAction.ADD, 'anchor', currentAnchor));
    }

    return diffs;
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override getAnchor(anchorId: string, parent: UnknownModel): AAnchor | undefined {
    return super.getAnchor(anchorId, parent);
  }

  override getAnchorIndex(anchorId: string, parent: UnknownModel): number {
    return super.getAnchorIndex(anchorId, parent);
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

  override setContext(): string {
    return `${this.NODE_NAME}=${this.overlayId}`;
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
