import { ModelType, UnknownOverlay } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { Diff, DiffAction } from '../functions/diff/diff.model.js';
import { AOverlay } from './overlay.abstract.js';
import { IOverlay } from './overlay.interface.js';

export class OverlayService {
  private readonly newOverlays: AOverlay<UnknownOverlay>[] = [];
  private readonly oldOverlays: AOverlay<UnknownOverlay>[] = [];

  constructor(newOverlays: AOverlay<UnknownOverlay>[]) {
    this.newOverlays = [...newOverlays];
    this.oldOverlays = [...newOverlays];
    Object.freeze(this.oldOverlays);
  }

  add(overlays: AOverlay<UnknownOverlay>[]): void {
    for (const overlay of overlays) {
      if (overlay.MODEL_TYPE !== ModelType.OVERLAY) {
        throw new Error('Adding non-overlay model!');
      }

      if (!this.getById(overlay.overlayId)) {
        this.newOverlays.push(overlay);
      }
    }
  }

  diff(): Diff[] {
    const diffs: Diff[] = [];

    for (const overlay of this.oldOverlays) {
      if (!this.newOverlays.find((o) => o.overlayId === overlay.overlayId)) {
        diffs.push(new Diff(overlay, DiffAction.DELETE, 'overlayId', overlay.overlayId));
      }
    }

    for (const overlay of this.newOverlays) {
      if (!this.oldOverlays.find((o) => o.overlayId === overlay.overlayId)) {
        diffs.push(new Diff(overlay, DiffAction.ADD, 'overlayId', overlay.overlayId));
      }
    }

    return diffs;
  }

  getById(overlayId: IOverlay['overlayId']): AOverlay<unknown> | undefined {
    return this.newOverlays.find((o) => o.overlayId === overlayId);
  }

  getByProperties(filters: { key: string; value: any }[] = []): AOverlay<UnknownOverlay>[] {
    return this.newOverlays.filter((o) => filters.every((c) => o.properties[c.key] === c.value));
  }
}

@Factory<OverlayService>(OverlayService)
export class OverlayServiceFactory {
  private static instance: OverlayService;

  static async create(forceNew = false, newOverlays: AOverlay<UnknownOverlay>[] = []): Promise<OverlayService> {
    if (forceNew || !this.instance) {
      this.instance = new OverlayService(newOverlays);
    }
    return this.instance;
  }
}
