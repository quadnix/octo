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

  async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const overlay of this.oldOverlays) {
      const newOverlay = this.newOverlays.find((o) => o.overlayId === overlay.overlayId);
      if (!newOverlay) {
        diffs.push(new Diff(overlay, DiffAction.DELETE, 'overlayId', overlay.overlayId));
      } else {
        diffs.push(...(await newOverlay.diff(overlay)));
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
      throw new Error('Removing non-overlay model!');
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
    oldOverlays: UnknownOverlay[],
    newOverlays: UnknownOverlay[],
  ): Promise<OverlayDataRepository> {
    if (!this.instance) {
      this.instance = new OverlayDataRepository(oldOverlays, newOverlays);
    }
    if (forceNew) {
      const newInstance = new OverlayDataRepository(oldOverlays, newOverlays);
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
