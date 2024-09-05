import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from '../functions/container/container.js';

/**
 * An `@Overlay` is a class decorator to be placed on top of a class that represents an overlay.
 * - An overlay must extend the {@link AOverlay} class.
 *
 * @example
 * ```ts
 * @Overlay()
 * export class MyOverlay extends AOverlay<MyOverlay> { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Overlays](/docs/fundamentals/overlay-and-anchor).
 */
export function Overlay(): (constructor: any) => void {
  return function (constructor: any) {
    const promise = Container.get(ModelSerializationService).then((modelSerializationService) => {
      modelSerializationService.registerClass(constructor.name, constructor);
    });
    Container.registerStartupUnhandledPromise(promise);
  };
}
