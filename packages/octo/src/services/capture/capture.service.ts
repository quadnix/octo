import { Factory } from '../../decorators/factory.decorator.js';
import { AResource } from '../../resources/resource.abstract.js';
import { IResource } from '../../resources/resource.interface.js';

export class CaptureService {
  private readonly captures: {
    [key: string]: { response: Partial<IResource['response']> };
  } = {};

  constructor() {}

  getCapture<T extends AResource<T>>(context: string): { response: Partial<T['response']> } | undefined {
    return this.captures[context];
  }

  registerCapture<T extends AResource<T>>(resourceContext: string, response: Partial<T['response']>): void {
    this.captures[resourceContext] = { response };
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
