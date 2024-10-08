import type { UnknownModel, UnknownOverlay } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { Factory } from '../decorators/factory.decorator.js';
import { OverlayDataRepository } from './overlay-data.repository.js';

export class OverlayService {
  constructor(private readonly overlayDataRepository: OverlayDataRepository) {}

  addOverlay(overlay: UnknownOverlay): void {
    this.overlayDataRepository.add(overlay);
  }

  getOverlayById(overlayId: string): UnknownOverlay | undefined {
    return this.overlayDataRepository.getById(overlayId);
  }

  getOverlays(filters?: {
    anchor?: { anchorId: string; parent: UnknownModel };
    excludeOverlayIds?: string[];
  }): UnknownOverlay[] {
    const overlays = this.getOverlaysByProperties();
    return overlays.filter((o) => {
      let shouldReturn = true;

      if (filters?.excludeOverlayIds && filters.excludeOverlayIds.includes(o.overlayId)) {
        shouldReturn = false;
      }
      if (filters?.anchor) {
        shouldReturn = !!(shouldReturn && o.getAnchor(filters.anchor.anchorId, filters.anchor.parent));
      }

      return shouldReturn;
    });
  }

  getOverlaysByProperties(filters: { key: string; value: any }[] = []): UnknownOverlay[] {
    return this.overlayDataRepository.getByProperties(filters);
  }
}

@Factory<OverlayService>(OverlayService)
export class OverlayServiceFactory {
  private static instance: OverlayService;

  static async create(): Promise<OverlayService> {
    const overlayDataRepository = await Container.get(OverlayDataRepository);
    if (!this.instance) {
      this.instance = new OverlayService(overlayDataRepository);
    }
    return this.instance;
  }
}
