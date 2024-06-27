import { Model } from '../../decorators/model.decorator.js';
import type { Diff } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import type { IService } from './service.interface.js';

@Model()
export class Service extends AModel<IService, Service> {
  readonly MODEL_NAME: string = 'service';

  readonly serviceId: string;

  constructor(serviceId: string) {
    super();
    this.serviceId = serviceId;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async diffProperties(previous: Service): Promise<Diff[]> {
    return [];
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serviceId}`, app.getContext()].join(',');
  }

  override synth(): IService {
    throw new Error('Method not implemented! Use subclass');
  }
}
