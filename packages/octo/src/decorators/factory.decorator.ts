import type { Constructable } from '../app.type.js';
import { Container } from './container.js';

/**
 * A `@Factory` is a class decorator to be placed on top of a class that represents a factory.
 * A factory is responsible for creating instances of a class.
 *
 * It is possible to generate multiple factories for the same class
 * by assigning a unique set of metadata to the factory.
 * Of all registered factories, only one can be the default factory.
 *
 * @example
 * ```ts
 * // Factory definition.
 * @Factory<MyService>(MyService, { metadata: { key: 'value' } })
 * export class MyServiceFactory {
 *   static async create(arg1, arg2, ...): Promise<MyService> { ... }>
 * }
 *
 * // Get instance using default factory.
 * const myService = await Container.get(MyService);
 *
 * // Get instance using specific factory.
 * const myService = await Container.get(MyService, { metadata: { key: 'value' } });
 *
 * // Pass args to factory.
 * const myService = await Container.get(MyService, { args: [arg1, arg2, ...] });
 * ```
 * @group Decorators
 * @param type The type of class that the factory creates.
 * @param options Allows registering multiple factories for the same class that differ by metadata.
 * @returns The decorated class.
 */
export function Factory<T>(
  type: Constructable<T> | string,
  options?: {
    metadata?: { [key: string]: string };
  },
): (constructor: { create: (...args: unknown[]) => Promise<T> }) => void {
  return function (constructor: { create: (...args: unknown[]) => Promise<T> }) {
    Container.registerFactory<T>(type, constructor, options);
  };
}
