import { UnknownOverlay } from '../app.type.js';
import { Container } from '../decorators/container.js';
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

  getOverlayByProperties(filters: { key: string; value: any }[] = []): UnknownOverlay[] {
    return this.overlayDataRepository.getByProperties(filters);
  }

  removeOverlay(overlay: UnknownOverlay): void {
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
