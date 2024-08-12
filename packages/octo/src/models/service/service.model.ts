import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { AModel } from '../model.abstract.js';
import type { IService } from './service.interface.js';

/**
 * A Service model can be any third-party service that your application relies on.
 * What separates them from Server is that Services are hosted and managed outside of your infrastructure.
 * An external Redis server on the cloud, or a managed Kafka queue from AWS, are a few examples.
 *
 * @example
 * ```ts
 * const service = new Service('MyService');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model()
export class Service extends AModel<IService, Service> {
  readonly NODE_NAME: string = 'service';

  /**
   * The ID of the service.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly serviceId: string;

  constructor(serviceId: string) {
    super();
    this.serviceId = serviceId;
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.NODE_NAME}=${this.serviceId}`, app.getContext()].join(',');
  }

  override synth(): IService {
    throw new Error('Method not implemented! Use subclass');
  }
}
