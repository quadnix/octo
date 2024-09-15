import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { ModelError } from '../../errors/index.js';
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
@Model('@octo', 'service')
export class Service extends AModel<IService, Service> {
  /**
   * The ID of the service.
   */
  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly serviceId: string;

  constructor(serviceId: string) {
    super();
    this.serviceId = serviceId;
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Service).NODE_NAME}=${this.serviceId}`, app.getContext()].join(',');
  }

  override synth(): IService {
    throw new ModelError('Method not implemented! Use subclass', this);
  }
}
