import { CommitHook } from '../functions/hook/commit.hook.js';

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
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    switch (hook) {
      case 'CommitHook':
        CommitHook.getInstance().registrar(descriptor);
        break;
      default:
        throw new Error(`Invalid hook "${hook}"!`);
    }
  };
}
