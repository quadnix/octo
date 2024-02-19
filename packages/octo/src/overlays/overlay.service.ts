import { UnknownOverlay } from '../app.type.js';
import { Container } from '../decorators/container.js';
import { Factory } from '../decorators/factory.decorator.js';
import { OverlayDataRepository } from './overlay-data.repository.js';

export class OverlayService {
  async addOverlay(overlay: UnknownOverlay): Promise<void> {
    const overlayDataRepository = await Container.get(OverlayDataRepository);
    overlayDataRepository.add(overlay);
  }

  async getOverlayById(overlayId: string): Promise<UnknownOverlay | undefined> {
    const overlayDataRepository = await Container.get(OverlayDataRepository);
    return overlayDataRepository.getById(overlayId);
  }

  async getOverlayByProperties(filters: { key: string; value: any }[] = []): Promise<UnknownOverlay[]> {
    const overlayDataRepository = await Container.get(OverlayDataRepository);
    return overlayDataRepository.getByProperties(filters);
  }

  async removeOverlay(overlay: UnknownOverlay): Promise<void> {
    const overlayDataRepository = await Container.get(OverlayDataRepository);
    overlayDataRepository.remove(overlay);
  }
}

@Factory<OverlayService>(OverlayService)
export class OverlayServiceFactory {
  private static instance: OverlayService;

  static async create(): Promise<OverlayService> {
    if (!this.instance) {
      this.instance = new OverlayService();
    }
    return this.instance;
  }
}
