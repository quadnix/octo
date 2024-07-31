import type { Constructable } from '../app.type.js';

type Factory<T> = { create: (...args: unknown[]) => Promise<T> };
type FactoryValue<T> = Factory<T> | [Promise<Factory<T>>, (factory: Factory<T>) => void];

/**
 * The Container class is a box to hold all registered factories.
 *
 * In Octo, we minimize the use of the `new` keyword and get instance of a class using its factory.
 * The factory has full control over how the instance is created.
 *
 * By using the Container and Factory concepts, it is possible to override internal class definitions at runtime.
 * It is an incredibly powerful tool to customize implementation.
 */
export class Container {
  private static FACTORY_TIMEOUT_IN_MS = 5000;

  private static readonly factories: {
    [key: string]: {
      default: boolean;
      factory: FactoryValue<any>;
      metadata: { [key: string]: string };
    }[];
  } = {};

  /**
   * `Container.get()` allows to get an instance of a class using its factory.
   *
   * @param type The type or name of the class to get.
   * @param options Allows selection of a specific factory to use to get the instance.
   * - The `args` option supplies arguments to the factory.
   * - The `metadata` option identifies the factory.
   * @returns The instance of the class.
   */
  static async get<T>(
    type: Constructable<T> | string,
    options?: {
      args?: unknown[];
      metadata?: { [key: string]: string };
    },
  ): Promise<T> {
    const args = options?.args || [];
    const metadata = options?.metadata;
    const name = typeof type === 'string' ? type : type.name;

    if (!(name in this.factories)) {
      this.factories[name] = [];
    }

    let factoryContainer: (typeof Container.factories)[keyof typeof Container.factories][0] | undefined;
    if (!metadata) {
      factoryContainer = this.factories[name].find((f) => f.default);
    } else {
      const filters: { key: string; value: string }[] = [];
      for (const key in metadata) {
        filters.push({ key, value: metadata[key] });
      }
      factoryContainer = this.factories[name].find((f) => filters.every((c) => f.metadata[c.key] === c.value));
    }

    if (factoryContainer?.factory) {
      if (!Array.isArray(factoryContainer.factory)) {
        return (factoryContainer.factory as Factory<T>).create(...args);
      } else {
        const factory = await (factoryContainer.factory[0] as Promise<Factory<T>>);
        return factory.create(...args);
      }
    }

    const newFactoryContainer = {
      default: true,
      metadata,
    } as (typeof Container.factories)[keyof typeof Container.factories][0];
    this.factories[name].push(newFactoryContainer);

    let promiseResolver;
    let promiseTimeout;
    const promise = new Promise<Factory<T>>((resolve, reject) => {
      promiseTimeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for factory ${name} to resolve!`));
      }, this.FACTORY_TIMEOUT_IN_MS);
      promiseResolver = resolve;
    });
    newFactoryContainer.factory = [promise, promiseResolver];

    const factory = await promise;
    if (promiseTimeout) {
      clearTimeout(promiseTimeout);
    }
    return factory.create(...args);
  }

  /**
   * `Container.registerFactory()` allows to register a factory for a class.
   *
   * @param type The type or name of the class for which the factory is registered.
   * @param factory The factory class being registered.
   * @param options Distinguishes between different factories of the same class.
   * - The `metadata` attaches custom metadata to the factory.
   */
  static registerFactory<T>(
    type: Constructable<T> | string,
    factory: Factory<T>,
    options?: {
      metadata?: { [key: string]: string };
    },
  ): void {
    const metadata = options?.metadata || {};
    const name = typeof type === 'string' ? type : type.name;

    if (!(name in this.factories)) {
      this.factories[name] = [];
    }

    const filters: { key: string; value: string }[] = [];
    for (const key in metadata) {
      filters.push({ key, value: metadata[key] });
    }
    const factoryContainer = this.factories[name].find((f) => filters.every((c) => f.metadata[c.key] === c.value));

    if (factoryContainer?.factory) {
      // If factory is not a promise set by get() above, it has already been registered.
      if (!Array.isArray(factoryContainer.factory)) {
        return;
      }

      factoryContainer.metadata = metadata;
      const resolve = factoryContainer.factory[1] as (factory: Factory<T>) => void;
      resolve(factory);
      factoryContainer.factory = factory;
      this.setDefault(type, factory);

      return;
    }

    this.factories[name].push({ default: false, factory, metadata });
    this.setDefault(type, factory);
  }

  /**
   * `Container.reset()` clears all registered factories and empties the container. This is mostly used in testing.
   */
  static reset(): void {
    this.FACTORY_TIMEOUT_IN_MS = 5000;

    for (const name in this.factories) {
      delete this.factories[name];
    }
  }

  /**
   * `Container.setDefault()` sets a default factory for the class.
   *
   * @example
   * ```ts
   * // Register a factory.
   * Container.registerFactory(MyClass, MyClassFactory, { metadata: { key: 'value' } });
   *
   * // Without default.
   * Container.get(MyClass, { metadata: { key: 'value' } });
   *
   * // Set default.
   * Container.setDefault(MyClass, MyClassFactory);
   *
   * // With default.
   * Container.get(MyClass);
   * ```
   * @param type The type or name of the class for which the default factory is set.
   * @param factory The factory class being set as default.
   */
  static setDefault<T>(type: Constructable<T> | string, factory: Factory<T>): void {
    const name = typeof type === 'string' ? type : type.name;

    this.factories[name]?.forEach((f) => {
      f.default = (f.factory as unknown as Constructable<T>).name === (factory as unknown as Constructable<T>).name;
    });
  }

  /**
   * The Container, by default, will wait a maximum of 5 seconds for a factory to resolve and provide an instance.
   * This method allows to change that timeout.
   *
   * @param timeoutInMs The timeout in milliseconds.
   */
  static setFactoryTimeout(timeoutInMs: number): void {
    this.FACTORY_TIMEOUT_IN_MS = timeoutInMs;
  }

  /**
   * `Container.unRegisterFactory()` will unregister all factories of a class.
   *
   * @param type The type or name of the class for which all factory is unregistered.
   */
  static unRegisterFactory<T>(type: Constructable<T> | string): void {
    const name = typeof type === 'string' ? type : type.name;
    delete this.factories[name];
  }
}
