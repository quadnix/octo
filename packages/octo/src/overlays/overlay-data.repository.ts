import { ModelType, UnknownOverlay } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { IOverlay } from './overlay.interface.js';

export class OverlayDataRepository {
  constructor(
    private oldOverlays: UnknownOverlay[] = [],
    private newOverlays: UnknownOverlay[] = [],
  ) {
    Object.freeze(this.oldOverlays);
  }

  add(overlay: UnknownOverlay): void {
    if (overlay.MODEL_TYPE !== ModelType.OVERLAY) {
      throw new Error('Adding non-overlay model!');
    }

    if (!this.getById(overlay.overlayId)) {
      this.newOverlays.push(overlay);
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

  getById(overlayId: IOverlay['overlayId']): UnknownOverlay | undefined {
    return this.newOverlays.find((o) => o.overlayId === overlayId);
  }

  getByProperties(filters: { key: string; value: any }[] = []): UnknownOverlay[] {
    return this.newOverlays.filter((o) => filters.every((c) => o.properties[c.key] === c.value));
  }

  remove(overlay: UnknownOverlay): void {
    if (overlay.MODEL_TYPE !== ModelType.OVERLAY) {
      throw new Error('Adding non-overlay model!');
    }

    const overlayIndex = this.newOverlays.findIndex((o) => o.overlayId === overlay.overlayId);
    if (overlayIndex > -1) {
      this.newOverlays.splice(overlayIndex, 1);
    }
  }
}

@Factory<OverlayDataRepository>(OverlayDataRepository)
export class OverlayDataRepositoryFactory {
  private static instance: OverlayDataRepository;

  static async create(
    forceNew: boolean,
    newOverlays: UnknownOverlay[],
    oldOverlays: UnknownOverlay[],
  ): Promise<OverlayDataRepository> {
    if (forceNew || !this.instance) {
      this.instance = new OverlayDataRepository(newOverlays, oldOverlays);
    }
    return this.instance;
  }
}
