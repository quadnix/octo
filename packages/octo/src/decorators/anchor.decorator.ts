import { RegistrationErrorEvent } from '../events/error.event.js';
import { EventService } from '../services/event/event.service.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from '../functions/container/container.js';

/**
 * An `@Anchor` is a class decorator to be placed on top of a class that represents an anchor.
 * - An anchor must extend the {@link AAnchor} class.
 *
 * @example
 * ```ts
 * @Anchor()
 * export class MyAnchor extends AAnchor { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Anchors](/docs/fundamentals/overlay-and-anchor).
 */
export function Anchor(): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ModelSerializationService)
      .then((modelSerializationService) => {
        modelSerializationService.registerClass(constructor.name, constructor);
      })
      .catch((error) => {
        EventService.getInstance().emit(new RegistrationErrorEvent(error));
      });
  };
}
