import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { AModel } from '../model.abstract.js';
import { ServiceSchema, type ServiceType } from './service.schema.js';

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
  /**
   * What the service actually is, in free text, e.g. `dynamodb`.
   */
  readonly label: string;

  readonly serviceId: string;

  /**
   * What kind of thing the service is.
   */
  readonly type: ServiceType;

  private readonly parentCount: number;

  /**
   * @param serviceId The ID of the service, unique among the services of each of its parents.
   * @param parents The models this service is attached under. They are fixed for its lifetime.
   * @param type What kind of thing the service is.
   * @param label What the service actually is, in free text, e.g. `dynamodb`.
   * @throws {@link ModelError} If no parent is given, or a parent already has a service with this ID.
   */
  constructor(serviceId: string, parents: UnknownModel[], type: ServiceType, label: string) {
    super();
    this.label = label;
    this.parentCount = parents.length;
    this.serviceId = serviceId;
    this.type = type;

    // Validate parents.
    if (parents.length === 0) {
      throw new ModelError('Service must have at least one parent!', this);
    }
    const parentFields = parents.map((p) => p.deriveDependencyField());
    if (parentFields.some((f) => f === undefined)) {
      throw new ModelError('Service parent must be attached to the graph!', this);
    }

    // Check for duplicates.
    for (const parent of parents) {
      const services = (parent.getChildren('service')['service'] || []).map((d): Service => d.to as Service);
      if (services.some((s) => s.serviceId === serviceId)) {
        throw new ModelError('Service already exists!', this);
      }
    }

    // Attach to every parent.
    for (const [index, parent] of parents.entries()) {
      parent.addChild(parentFields[index]!, this, 'serviceId');
    }
  }

  /**
   * @internal
   */
  override setContext(): string | undefined {
    const parents = Object.values(this.getParents()).flat();
    if (parents.length < this.parentCount) {
      return undefined;
    }
    return [
      `${(this.constructor as typeof Service).NODE_NAME}=${this.serviceId}`,
      ...parents.map((d) => d.to.getContext()).sort(),
    ].join(',');
  }

  /**
   * @internal
   */
  override synth(): ServiceSchema {
    const parentContexts = Object.values(this.getParents())
      .flat()
      .map((d) => d.to.getContext())
      .sort();

    return {
      label: this.label,
      parents: parentContexts.map((context) => ({ context })),
      serviceId: this.serviceId,
      type: this.type,
    };
  }
}
