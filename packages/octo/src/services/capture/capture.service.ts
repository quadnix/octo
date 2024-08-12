import { Factory } from '../../decorators/factory.decorator.js';
import { AResource } from '../../resources/resource.abstract.js';
import { IResource } from '../../resources/resource.interface.js';

export class CaptureService {
  private readonly captures: {
    [key: string]: { response: Partial<IResource['response']> };
  } = {};

  getCapture<T extends AResource<T>>(resourceId: string): { response: Partial<T['response']> } | undefined {
    return this.captures[resourceId];
  }

  registerCapture<T extends AResource<T>>(resourceId: T['resourceId'], response: Partial<T['response']>): void {
    this.captures[resourceId] = { response };
  }
}

@Factory<CaptureService>(CaptureService)
export class CaptureServiceFactory {
  private static instance: CaptureService;

  static async create(): Promise<CaptureService> {
    if (!this.instance) {
      this.instance = new CaptureService();
    }
    return this.instance;
  }
}
