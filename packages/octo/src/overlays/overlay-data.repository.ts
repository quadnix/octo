import { NodeType, type UnknownOverlay } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { OverlayError } from '../errors/index.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import type { AOverlay } from './overlay.abstract.js';

export class OverlayDataRepository {
  constructor(private newOverlays: UnknownOverlay[]) {}

  add(overlay: UnknownOverlay): void {
    if ((overlay.constructor as typeof AOverlay).NODE_TYPE !== NodeType.OVERLAY) {
      throw new OverlayError('Adding non-overlay model!', overlay);
    }

    const existingOverlay = this.getByContext(overlay.getContext());
    if (existingOverlay) {
      throw new OverlayError('Overlay already exists!', existingOverlay);
    } else {
      this.newOverlays.push(overlay);
    }
  }

  async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const overlay of this.newOverlays) {
      const oDiff = await overlay.diff();
      diffs.push(...oDiff, new Diff(overlay, DiffAction.ADD, 'overlayId', overlay.overlayId));
    }

    return diffs;
  }

  getByContext(overlayContext: string): UnknownOverlay | undefined {
    return this.newOverlays.find((o) => o.getContext() === overlayContext);
  }

  getByProperties(filters: { key: string; value: any }[] = []): UnknownOverlay[] {
    return this.newOverlays.filter((o) => filters.every((c) => o.properties[c.key] === c.value));
  }
}

@Factory<OverlayDataRepository>(OverlayDataRepository)
export class OverlayDataRepositoryFactory {
  private static instance: OverlayDataRepository;

  static async create(forceNew = false, newOverlays: UnknownOverlay[] = []): Promise<OverlayDataRepository> {
    if (!this.instance) {
      this.instance = new OverlayDataRepository(newOverlays);
    }
    if (forceNew) {
      const newInstance = new OverlayDataRepository(newOverlays);
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
