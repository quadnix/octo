import { ModelType, UnknownModel, UnknownOverlay } from '../app.type.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { AModel } from '../models/model.abstract.js';
import { AAnchor } from './anchor.abstract.js';
import { IOverlay } from './overlay.interface.js';

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
      this.addRelationship('overlayId', anchor.getParent(), 'MODEL_NAME');
      this.anchors.push(anchor);
    }
  }

  async diff(previous?: T): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (previous) {
      const propertyDiffs = DiffUtility.diffObject(
        (previous || { properties: {} }) as unknown as UnknownOverlay,
        this,
        'properties',
      );
      diffs.push(...propertyDiffs);
    } else {
      diffs.push(new Diff(this, DiffAction.ADD, 'overlayId', this.overlayId));
    }

    return diffs;
  }

  getContext(): string {
    return `${this.MODEL_NAME}=${this.overlayId}`;
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
