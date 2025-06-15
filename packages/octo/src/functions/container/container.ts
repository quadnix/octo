import type { Constructable } from '../../app.type.js';
import { ContainerRegistrationError, ContainerResolutionError } from '../../errors/index.js';
import { DiffUtility } from '../diff/diff.utility.js';

type Factory<T> = { create: (...args: unknown[]) => Promise<T> };
type FactoryValue<T> = Factory<T> | [Promise<Factory<T>>, (factory: Factory<T>) => void];
type FactoryContainer<T> = { factory: FactoryValue<T>; metadata: { [key: string]: string } };

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
  private FACTORY_TIMEOUT_IN_MS = 3000;

  private readonly factories: { [key: string]: FactoryContainer<unknown>[] } = {};

  private static instance: Container;

  private readonly startupUnhandledPromises: Promise<unknown>[] = [];

  private constructor() {}

  copyFactories(): { [key: string]: FactoryContainer<unknown>[] } {
    const newFactoriesCopy: { [key: string]: FactoryContainer<unknown>[] } = {};

    for (const [type, factoryContainers] of Object.entries(this.factories)) {
      newFactoriesCopy[type] = [];
      for (const factoryContainer of factoryContainers) {
        newFactoriesCopy[type].push({
          factory: factoryContainer.factory,
          metadata: { ...factoryContainer.metadata },
        });
      }
    }

    return newFactoriesCopy;
  }

  /**
   * `container.get()` allows to get an instance of a class using its factory.
   * If the factory is not yet registered, it places a blocking promise in the queue to wait for the registration.
   *
   * @param type The type or name of the class to get.
   * @param options Allows selection of a specific factory to use to get the instance.
   * - The `args` option supplies arguments to the factory.
   * - The `metadata` option identifies the factory.
   * @returns The instance of the class.
   */
  async get<T, F extends Factory<T> = never>(
    type: Constructable<T> | string,
    options?: {
      args?: Parameters<F['create']>;
      metadata?: { [key: string]: string };
    },
  ): Promise<T> {
    const args = options?.args || [];
    const metadata = options?.metadata || {};
    const name = typeof type === 'string' ? type : type.name;

    if (!(name in this.factories)) {
      this.factories[name] = [];
    }

    const factoryContainer = this.factories[name].find((f) => DiffUtility.isObjectDeepEquals(f.metadata, metadata));
    if (factoryContainer?.factory) {
      if (!Array.isArray(factoryContainer.factory)) {
        return (factoryContainer.factory as Factory<T>).create(...args);
      } else {
        const factory = await (factoryContainer.factory[0] as Promise<Factory<T>>);
        return factory.create(...args);
      }
    }

    const newFactoryContainer: FactoryContainer<T> = {
      metadata,
    } as FactoryContainer<T>;
    this.factories[name].push(newFactoryContainer);

    let promiseResolver: Awaited<(factory: Factory<T>) => void>;
    let promiseTimeout: NodeJS.Timeout | undefined;
    const promise = new Promise<Factory<T>>((resolve, reject) => {
      promiseTimeout = setTimeout(() => {
        reject(new ContainerResolutionError('Timed out waiting for factory to resolve!', type));
      }, this.FACTORY_TIMEOUT_IN_MS);
      promiseResolver = resolve;
    });
    newFactoryContainer.factory = [promise, promiseResolver!];

    const factory = await promise;
    if (promiseTimeout) {
      clearTimeout(promiseTimeout);
    }
    return factory.create(...args);
  }

  static getInstance(): Container {
    if (!this.instance) {
      this.instance = new Container();
    }
    return this.instance;
  }

  has<T>(
    type: Constructable<T> | string,
    options?: {
      metadata?: { [key: string]: string };
    },
  ): boolean {
    const metadata = options?.metadata || {};
    const name = typeof type === 'string' ? type : type.name;

    if (!(name in this.factories)) {
      return false;
    }

    return this.factories[name].some((f) => DiffUtility.isObjectDeepEquals(f.metadata, metadata));
  }

  /**
   * `Container.registerFactory()` allows to register a factory for a class.
   *
   * @param type The type or name of the class for which the factory is registered.
   * @param factory The factory class being registered.
   * @param options Distinguishes between different factories of the same class.
   * - The `metadata` attaches custom metadata to the factory.
   */
  registerFactory<T>(
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

    const factoryContainer = this.factories[name].find((f) => DiffUtility.isObjectDeepEquals(f.metadata, metadata));
    if (factoryContainer?.factory) {
      // If factory is not a promise set by get() above, it has already been registered.
      if (!Array.isArray(factoryContainer.factory)) {
        throw new ContainerRegistrationError('Factory has already been registered!', type);
      }

      factoryContainer.metadata = metadata;
      const resolve = factoryContainer.factory[1] as (factory: Factory<T>) => void;
      resolve(factory);
      factoryContainer.factory = factory;

      return;
    }

    this.factories[name].push({ factory, metadata });
  }

  registerValue<T>(
    type: Constructable<T> | string,
    value: T,
    options?: {
      metadata?: { [key: string]: string };
    },
  ): void {
    this.registerFactory(
      type,
      class {
        static async create(): Promise<T> {
          return value;
        }
      },
      options,
    );
  }

  registerStartupUnhandledPromise<T>(promise: Promise<T>): void {
    this.startupUnhandledPromises.push(promise);
  }

  /**
   * `Container.reset()` clears all registered factories and empties the container. This is mostly used in testing.
   */
  reset(): void {
    this.FACTORY_TIMEOUT_IN_MS = 3000;

    for (const name in this.factories) {
      delete this.factories[name];
    }

    this.startupUnhandledPromises.splice(0, this.startupUnhandledPromises.length);
  }

  setFactories(factories: { [key: string]: FactoryContainer<unknown>[] }): void {
    for (const [type, factoryContainers] of Object.entries(factories)) {
      this.factories[type] = [];
      for (const factoryContainer of factoryContainers) {
        this.factories[type].push({
          factory: factoryContainer.factory,
          metadata: { ...factoryContainer.metadata },
        });
      }
    }
  }

  /**
   * The Container, by default, will wait a maximum of 5 seconds for a factory to resolve and provide an instance.
   * This method allows to change that timeout.
   *
   * @param timeoutInMs The timeout in milliseconds.
   */
  setFactoryTimeout(timeoutInMs: number): void {
    this.FACTORY_TIMEOUT_IN_MS = timeoutInMs;
  }

  /**
   * `Container.unRegisterFactory()` will unregister all factories of a class.
   *
   * @param type The type or name of the class for which all factory is unregistered.
   * @param options
   */
  unRegisterFactory<T>(type: Constructable<T> | string, options?: { metadata?: { [key: string]: string } }): void {
    const name = typeof type === 'string' ? type : type.name;

    if (!options) {
      delete this.factories[name];
      return;
    }

    const metadata = options?.metadata || {};
    const index = this.factories[name]?.findIndex((f) => DiffUtility.isObjectDeepEquals(f.metadata, metadata));
    if (index > -1) {
      this.factories[name].splice(index, 1);
    }
  }

  async waitToResolveAllFactories(): Promise<void> {
    const promiseToResolveAllFactories: Promise<Factory<unknown>>[] = [];

    for (const name of Object.keys(this.factories)) {
      for (const factoryContainer of this.factories[name]) {
        if (factoryContainer?.factory && Array.isArray(factoryContainer.factory)) {
          promiseToResolveAllFactories.push(factoryContainer.factory[0]);
        }
      }
    }

    await Promise.all([...promiseToResolveAllFactories, ...this.startupUnhandledPromises]);
  }
}
