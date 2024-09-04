import type { Constructable } from '../../app.type.js';

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

  private static readonly factories: { [key: string]: { factory: FactoryValue<any> } } = {};

  /**
   * `Container.get()` allows to get an instance of a class using its factory.
   *
   * @param type The type or name of the class to get.
   * @param options Allows selection of a specific factory to use to get the instance.
   * - The `args` option supplies arguments to the factory.
   * @returns The instance of the class.
   */
  static async get<T>(
    type: Constructable<T> | string,
    options?: {
      args?: unknown[];
    },
  ): Promise<T> {
    const args = options?.args || [];
    const name = typeof type === 'string' ? type : type.name;

    const factoryContainer: (typeof Container.factories)[keyof typeof Container.factories] | undefined =
      this.factories[name];
    if (factoryContainer?.factory) {
      if (!Array.isArray(factoryContainer.factory)) {
        return (factoryContainer.factory as Factory<T>).create(...args);
      } else {
        const factory = await (factoryContainer.factory[0] as Promise<Factory<T>>);
        return factory.create(...args);
      }
    }

    const newFactoryContainer = {} as (typeof Container.factories)[keyof typeof Container.factories];
    this.factories[name] = newFactoryContainer;

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
   */
  static registerFactory<T>(type: Constructable<T> | string, factory: Factory<T>): void {
    const name = typeof type === 'string' ? type : type.name;

    const factoryContainer = this.factories[name];
    if (factoryContainer?.factory) {
      // If factory is not a promise set by get() above, it has already been registered.
      if (!Array.isArray(factoryContainer.factory)) {
        return;
      }

      const resolve = factoryContainer.factory[1] as (factory: Factory<T>) => void;
      resolve(factory);
      factoryContainer.factory = factory;

      return;
    } else {
      this.factories[name] = { factory };
    }
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

  static async waitToResolveAllFactories(): Promise<void> {
    const promiseToResolveAllFactories: Promise<Factory<unknown>>[] = [];

    for (const name of Object.keys(this.factories)) {
      const factoryContainer = this.factories[name];
      if (factoryContainer?.factory && Array.isArray(factoryContainer.factory)) {
        promiseToResolveAllFactories.push(factoryContainer.factory[0]);
      }
    }

    await Promise.all(promiseToResolveAllFactories);
  }
}
