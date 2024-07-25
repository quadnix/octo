import type { Constructable } from '../app.type.js';

type Factory<T> = { create: (...args: unknown[]) => Promise<T> };
type FactoryValue<T> = Factory<T> | [Promise<Factory<T>>, (factory: Factory<T>) => void];

export class Container {
  private static FACTORY_TIMEOUT_IN_MS = 5000;

  private static readonly factories: {
    [key: string]: {
      default: boolean;
      factory: FactoryValue<any>;
      metadata: { [key: string]: string };
    }[];
  } = {};

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

  static reset(): void {
    this.FACTORY_TIMEOUT_IN_MS = 5000;

    for (const name in this.factories) {
      delete this.factories[name];
    }
  }

  static setDefault<T>(type: Constructable<T> | string, factory: Factory<T>): void {
    const name = typeof type === 'string' ? type : type.name;

    this.factories[name]?.forEach((f) => {
      f.default = (f.factory as unknown as Constructable<T>).name === (factory as unknown as Constructable<T>).name;
    });
  }

  static setFactoryTimeout(timeoutInMs: number): void {
    this.FACTORY_TIMEOUT_IN_MS = timeoutInMs;
  }
}
