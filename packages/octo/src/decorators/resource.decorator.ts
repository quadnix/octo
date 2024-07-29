import { RegistrationErrorEvent } from '../events/error.event.js';
import { EventService } from '../services/event/event.service.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { Container } from './container.js';

/**
 * A `@Resource` is a class decorator to be placed on top of a class that represents a resource.
 * - A resource must extend the {@link AResource} class.
 *
 * @example
 * ```ts
 * @Resource()
 * export class MyResource extends AResource<MyResource> { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Resources](http://localhost:3000/docs/fundamentals/resources).
 */
export function Resource(): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ResourceSerializationService)
      .then((resourceSerializationService) => {
        resourceSerializationService.registerClass(constructor.name, constructor);
      })
      .catch((error) => {
        EventService.getInstance().emit(new RegistrationErrorEvent(error));
      });
  };
}
