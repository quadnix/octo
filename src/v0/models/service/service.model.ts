import { Model } from '../model.abstract';
import { IService } from './service.interface';

export class Service extends Model<IService, Service> {
  readonly MODEL_NAME: string = 'service';

  readonly serviceId: string;

  constructor(serviceId: string) {
    super();
    this.serviceId = serviceId;
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serviceId}`, app.getContext()].join(',');
  }

  synth(): IService {
    throw new Error('Method not implemented! Use subclass');
  }
}
