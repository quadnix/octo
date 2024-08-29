import type { Constructable } from '../app.type.js';
import { Container } from '../functions/container/container.js';

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
 *   static async create(arg1, arg2, ...): Promise<MyService> { ... }
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
 * @remarks
 * If the factory is dependent on other factories, it should not block creation of its instance.
 * ```ts
 * // Correct, since creation of instance is not blocked.
 * // In this case, when multiple code paths are trying to get Container.get(MyService) at the same time,
 * // each of them will `await` for OtherService to get resolved,
 * // and the first to resolve will be able to create the instance, that the rest will re-use.
 * export class MyServiceFactory {
 *   private static instance: MyService;
 *   static async create(): Promise<MyService> {
 *     const otherInstance = await Container.get(OtherService);
 *     if (!this.instance) {
 *       this.instance = new MyService(otherInstance);
 *     }
 *   }
 * }
 * ```
 * ```ts
 * // Wrong, since creation of instance is blocked.
 * // In this case, when multiple code paths are trying to get Container.get(MyService) at the same time,
 * // each of them will get a new instance since during `await` there is race condition.
 * export class MyServiceFactory {
 *   private static instance: MyService;
 *   static async create(): Promise<MyService> {
 *     if (!this.instance) {
 *       const otherInstance = await Container.get(OtherService);
 *       this.instance = new MyService(otherInstance);
 *     }
 *   }
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
  return function (constructor: { create: (...args: unknown[]) => Promise<T> }) {
    Container.registerFactory<T>(type, constructor, options);
  };
}
