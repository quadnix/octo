import { ModelType, UnknownOverlay } from '../app.type.js';
import { Container } from '../decorators/container.js';
import { Factory } from '../decorators/factory.decorator.js';
import { AOverlay } from './overlay.abstract.js';
import { IOverlay } from './overlay.interface.js';

export class OverlayData {
  private overlays: AOverlay<UnknownOverlay>[] = [];

  add(overlays: AOverlay<UnknownOverlay>[]): void {
    for (const overlay of overlays) {
      if (overlay.MODEL_TYPE !== ModelType.OVERLAY) {
        throw new Error('Adding non-overlay model!');
      }

      if (!this.getById(overlay.overlayId)) {
        this.overlays.push(overlay);
      }
    }
  }

  empty(): void {
    this.overlays.splice(0, this.overlays.length);
  }

  getById(overlayId: IOverlay['overlayId']): AOverlay<unknown> | undefined {
    return this.overlays.find((o) => o.overlayId === overlayId);
  }

  getByProperties(filters: { key: string; value: any }[] = []): AOverlay<UnknownOverlay>[] {
    return this.overlays.filter((o) => filters.every((c) => o.properties[c.key] === c.value));
  }
}

@Factory<OverlayData>(OverlayData)
export class OverlayDataFactory {
  private static instance: OverlayData;

  static async create(): Promise<OverlayData> {
    if (!this.instance) {
      this.instance = new OverlayData();
    }
    return this.instance;
  }
}

// Register overlay factories to ensure OverlayData is available for store old and new overlays.
Container.registerFactory(OverlayData, OverlayDataFactory, { metadata: { type: 'old' } });
Container.registerFactory(OverlayData, OverlayDataFactory, { metadata: { type: 'new' } });
