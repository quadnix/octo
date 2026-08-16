import type { Constructable } from '../app.type.js';
import { Container } from '../functions/container/container.js';

/**
 * A `@Factory` is a class decorator to be placed on top of a class that represents a factory.
 * A factory is responsible for creating instances of a class - Octo resolves every service through one
 * rather than calling `new`, which is what lets you swap an internal implementation for your own.
 *
 * The same class may have several factories, told apart by their metadata.
 * The factory registered without metadata is the default.
 *
 * @example
 * ```ts
 * // Factory definition.
 * @Factory<MyService>(MyService, { metadata: { key: 'value' } })
 * export class MyServiceFactory {
 *   static async create(arg1, arg2): Promise<MyService> { ... }
 * }
 *
 * const container = Container.getInstance();
 *
 * // Get instance using default factory.
 * const myService = await container.get(MyService);
 *
 * // Get instance using specific factory.
 * const myService = await container.get(MyService, { metadata: { key: 'value' } });
 *
 * // Pass args to factory.
 * const myService = await container.get(MyService, { args: [arg1, arg2] });
 * ```
 * @group Decorators
 * @param type The type of class that the factory creates.
 * @param options Allows registering multiple factories for the same class that differ by metadata.
 * @remarks
 * A factory that produces a singleton must `await` its own dependencies *before* the instance check.
 * Awaiting inside the check is a race - concurrent callers each pass the check while suspended,
 * and each gets a different instance.
 * ```ts
 * static async create(): Promise<MyService> {
 *   const otherInstance = await Container.get(OtherService); // Await first.
 *   if (!this.instance) {
 *     this.instance = new MyService(otherInstance);
 *   }
 *   return this.instance;
 * }
 * ```
 * @returns The decorated class.
 */
export function Factory<T>(
  type: Constructable<T> | string,
  options?: {
    metadata?: { [key: string]: string };
  },
): (constructor: { create: (...args: unknown[]) => Promise<T> }) => void {
  const container = Container.getInstance();

  return function (constructor: { create: (...args: unknown[]) => Promise<T> }) {
    container.registerFactory<T>(type, constructor, options);
  };
}
