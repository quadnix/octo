import { Factory } from '../../decorators/factory.decorator.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';

/**
 * @internal
 */
export class CaptureService {
  private captures: {
    [key: string]: { response: Partial<BaseResourceSchema['response']> };
  } = {};

  getAllCaptures(): CaptureService['captures'] {
    return this.captures;
  }

  getCapture<S extends BaseResourceSchema>(context: string): { response: Partial<S['response']> } | undefined {
    return this.captures[context];
  }

  registerCapture<S extends BaseResourceSchema>(resourceContext: string, response: Partial<S['response']>): void {
    this.captures[resourceContext] = { response };
  }
}

/**
 * @internal
 */
@Factory<CaptureService>(CaptureService)
export class CaptureServiceFactory {
  private static instance: CaptureService;

  static async create(forceNew: boolean = false): Promise<CaptureService> {
    if (!this.instance) {
      this.instance = new CaptureService();
    }

    if (forceNew) {
      this.instance['captures'] = {};
    }

    return this.instance;
  }
}
