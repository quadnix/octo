import { Container } from '../functions/container/container.js';
import { CommitHook } from '../functions/hook/commit.hook.js';
import { EventService } from '../services/event/event.service.js';

type Hook = 'CommitHook';

/**
 * A `@EnableHook` is a method decorator to enable registration of hooks.
 *
 * @example
 * ```ts
 * @EnableHook('CommitHook')
 * async commitTransaction(): Promise<void> { ... }
 * ```
 * @group Decorators
 * @internal
 * @param hook The only values supported are `CommitHook`.
 * @returns The decorated method.
 * @see Definition of [Hooks](/docs/fundamentals/modules#hooks).
 */
export function EnableHook(hook: Hook): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  const container = Container.getInstance();

  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const promise = container.get(EventService).then((eventService) => {
      switch (hook) {
        case 'CommitHook':
          CommitHook.getInstance(eventService).registrar(descriptor);
          break;
        default:
          throw new Error(`Invalid hook "${hook}"!`);
      }
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
