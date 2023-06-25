import { App } from '../app/app.model';
import { IModel } from '../model.interface';
import { Diff } from '../utility/diff/diff.utility.model';
import { IService } from './service.interface';

export class Service implements IModel<IService, Service> {
  readonly context: App;

  readonly serviceId: string;

  constructor(context: App, serviceId: string) {
    this.context = context;
    this.serviceId = serviceId;
  }

  clone(): Service {
    return new Service(this.context, this.serviceId);
  }

  diff(): Diff[] {
    return [];
  }

  getContext(): string {
    return [`service=${this.serviceId}`, this.context.getContext()].join(',');
  }

  synth(): IService {
    return {
      serviceId: this.serviceId,
    };
  }
}
