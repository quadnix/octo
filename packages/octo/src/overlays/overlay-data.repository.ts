import { NodeType, type UnknownOverlay } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import type { IOverlay } from './overlay.interface.js';

export class OverlayDataRepository {
  constructor(private newOverlays: UnknownOverlay[] = []) {}

  add(overlay: UnknownOverlay): void {
    if (overlay.NODE_TYPE !== NodeType.OVERLAY) {
      throw new Error('Adding non-overlay model!');
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

  static async create(): Promise<OverlayDataRepository> {
    if (!this.instance) {
      this.instance = new OverlayDataRepository();
    }
    return this.instance;
  }
}
