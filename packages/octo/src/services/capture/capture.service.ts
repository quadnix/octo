import { Factory } from '../../decorators/factory.decorator.js';
import { AResource } from '../../resources/resource.abstract.js';
import { IResource } from '../../resources/resource.interface.js';

export class CaptureService {
  private readonly captures: {
    [key: string]: { properties: Partial<IResource['properties']>; response: Partial<IResource['response']> };
  } = {};

  getCapture<T extends AResource<T>>(
    resourceId: string,
  ): { properties: Partial<T['properties']>; response: Partial<T['response']> } | undefined {
    return this.captures[resourceId];
  }

  registerCapture<T extends AResource<T>>(
    resourceId: T['resourceId'],
    properties: Partial<T['properties']>,
    response: Partial<T['response']>,
  ): void {
    this.captures[resourceId] = { properties, response };
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
