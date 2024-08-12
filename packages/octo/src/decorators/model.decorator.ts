import { RegistrationErrorEvent } from '../events/error.event.js';
import { EventService } from '../services/event/event.service.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from '../functions/container/container.js';

/**
 * A `@Model` is a class decorator to be placed on top of a class that represents a model.
 * - A model must extend the {@link AModel} class.
 *
 * @example
 * ```ts
 * @Model()
 * export class MyModel extends AModel<IMyModel, MyModel> { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Models](/docs/fundamentals/models).
 */
export function Model(): (constructor: any) => void {
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
