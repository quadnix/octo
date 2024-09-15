import { NodeType, type UnknownOverlay } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { ModelError } from '../errors/index.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import type { AOverlay } from './overlay.abstract.js';
import type { IOverlay } from './overlay.interface.js';

export class OverlayDataRepository {
  constructor(private newOverlays: UnknownOverlay[] = []) {}

  add(overlay: UnknownOverlay): void {
    if ((overlay.constructor as typeof AOverlay).NODE_TYPE !== NodeType.OVERLAY) {
      throw new ModelError('Adding non-overlay model!', overlay);
    }

    if (!this.getById(overlay.overlayId)) {
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

  getById(overlayId: IOverlay['overlayId']): UnknownOverlay | undefined {
    return this.newOverlays.find((o) => o.overlayId === overlayId);
  }

  getByProperties(filters: { key: string; value: any }[] = []): UnknownOverlay[] {
    return this.newOverlays.filter((o) => filters.every((c) => o.properties[c.key] === c.value));
  }
}

@Factory<OverlayDataRepository>(OverlayDataRepository)
export class OverlayDataRepositoryFactory {
  private static instance: OverlayDataRepository;

  static async create(forceNew = false): Promise<OverlayDataRepository> {
    if (!this.instance) {
      this.instance = new OverlayDataRepository();
    }
    if (forceNew) {
      const newInstance = new OverlayDataRepository();
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
