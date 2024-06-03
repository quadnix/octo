import { ModelType } from '../app.type.js';
import type { UnknownModel, UnknownOverlay } from '../app.type.js';
import { DiffAction } from '../functions/diff/diff.js';
import type { Diff } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { AModel } from '../models/model.abstract.js';
import type { AAnchor } from './anchor.abstract.js';
import type { IOverlay } from './overlay.interface.js';

export abstract class AOverlay<T> extends AModel<IOverlay, T> {
  abstract override readonly MODEL_NAME: string;
  override readonly MODEL_TYPE: ModelType = ModelType.OVERLAY;

  readonly overlayId: IOverlay['overlayId'];

  readonly properties: IOverlay['properties'] = {};

  protected constructor(overlayId: IOverlay['overlayId'], properties: IOverlay['properties'], anchors: AAnchor[]) {
    super();

    this.overlayId = overlayId;

    for (const key in properties) {
      this.properties[key] = properties[key];
    }

    for (const anchor of anchors) {
      this.addAnchor(anchor);
    }
  }

  addAnchor(anchor: AAnchor): void {
    const dependencies = this.addRelationship(anchor.getParent());
    dependencies[0].addBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.ADD);
    dependencies[0].addBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.UPDATE);
    dependencies[1].addBehavior('MODEL_NAME', DiffAction.DELETE, 'overlayId', DiffAction.DELETE);

    this.anchors.push(anchor);
  }

  async diff(previous: T): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = DiffUtility.diffObject(previous as unknown as UnknownOverlay, this, 'properties');
    diffs.push(...propertyDiffs);

    return diffs;
  }

  getContext(): string {
    return `${this.MODEL_NAME}=${this.overlayId}`;
  }

  removeAnchor(anchor: AAnchor): void {
    const overlayDependencyIndex = this.dependencies.findIndex((d) => d.from === this && d.to === anchor.getParent());
    if (overlayDependencyIndex > -1) {
      this.dependencies.splice(overlayDependencyIndex, 1);
    }
    const parentDependencyIndex = anchor
      .getParent()
      ['dependencies'].findIndex((d) => d.from === anchor.getParent() && d.to === this);
    if (parentDependencyIndex > -1) {
      anchor.getParent()['dependencies'].splice(parentDependencyIndex, 1);
    }

    const anchorIndex = this.anchors.findIndex((a) => a.anchorId === anchor.anchorId);
    if (anchorIndex > -1) {
      this.anchors.splice(anchorIndex, 1);
    }
  }

  synth(): IOverlay {
    return {
      anchors: this.anchors.map((a) => a.synth()),
      overlayId: this.overlayId,
      properties: { ...this.properties },
    };
  }

  static async unSynth(
    deserializationClass: any,
    overlay: IOverlay,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<UnknownOverlay> {
    const anchors = await Promise.all(
      overlay.anchors.map(async (a) => {
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
