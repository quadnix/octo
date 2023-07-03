import { Model } from '../model.abstract';
import { Diff } from '../../functions/diff/diff.model';
import { IService } from './service.interface';

export class Service extends Model<IService, Service> {
  readonly MODEL_NAME: string = 'service';

  readonly serviceId: string;

  constructor(serviceId: string) {
    super();
    this.serviceId = serviceId;
  }

  clone(): Service {
    return new Service(this.serviceId);
  }

  diff(): Diff[] {
    return [];
  }

  synth(): IService {
    return {
      serviceId: this.serviceId,
    };
  }
}
