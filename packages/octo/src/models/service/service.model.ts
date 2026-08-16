import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { AModel } from '../model.abstract.js';
import { ServiceSchema } from './service.schema.js';

/**
 * A Service model can be any third-party service that your application relies on.
 * What separates them from Server is that Services are hosted and managed outside of your infrastructure.
 * An external Redis server on the cloud, or a managed Kafka queue from AWS, are a few examples.
 *
 * `Service` carries nothing but an ID, so it is only useful when extended - a subclass adds the fields
 * the third-party service actually needs, and overrides `synth()`. Calling `synth()` on `Service`
 * itself throws.
 *
 * @example
 * ```ts
 * @Model<MyService>('@example', 'service', MyServiceSchema)
 * export class MyService extends Service { ... }
 * ```
 *
 * @group Models/Service
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Service>('@octo', 'service', ServiceSchema)
export class Service extends AModel<ServiceSchema, Service> {
  readonly serviceId: string;

  /**
   * @param serviceId The ID of the service, unique within the app.
   */
  constructor(serviceId: string) {
    super();
    this.serviceId = serviceId;
  }

  /**
   * @internal
   */
  override setContext(): string | undefined {
    const parents = this.getParents();
    const app = parents['app']?.[0]?.to;
    if (!app) {
      return undefined;
    }
    return [`${(this.constructor as typeof Service).NODE_NAME}=${this.serviceId}`, app.getContext()].join(',');
  }

  /**
   * @internal
   */
  override synth(): ServiceSchema {
    throw new ModelError('Method not implemented! Use subclass', this);
  }
}
