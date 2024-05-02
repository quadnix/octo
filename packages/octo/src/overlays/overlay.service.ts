import { UnknownOverlay } from '../app.type.js';
import { Container } from '../decorators/container.js';
import { Factory } from '../decorators/factory.decorator.js';
import { OverlayDataRepository } from './overlay-data.repository.js';

export class OverlayService {
  constructor(private readonly overlayDataRepository: OverlayDataRepository) {}

  async addOverlay(overlay: UnknownOverlay): Promise<void> {
    this.overlayDataRepository.add(overlay);
  }

  async getOverlayById(overlayId: string): Promise<UnknownOverlay | undefined> {
    return this.overlayDataRepository.getById(overlayId);
  }

  async getOverlayByProperties(filters: { key: string; value: any }[] = []): Promise<UnknownOverlay[]> {
    return this.overlayDataRepository.getByProperties(filters);
  }

  async removeOverlay(overlay: UnknownOverlay): Promise<void> {
    this.overlayDataRepository.remove(overlay);
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
