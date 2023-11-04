import { Constructable } from '../app.type.js';

type Factory<T> = { create: () => Promise<T> };
type FactoryValue<T> = Factory<T> | [Promise<Factory<T>>, (factory: Factory<T>) => void];

export class Container {
  private static readonly factories: {
    [key: string]: {
      factory: FactoryValue<any>;
      metadata: { [key: string]: string };
    }[];
  } = {};

  static async get<T>(type: Constructable<T> | string, metadata: { [key: string]: string } = {}): Promise<T> {
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
      if (!Array.isArray(factoryContainer.factory)) {
        return (factoryContainer.factory as Factory<T>).create();
      } else {
        const factory = await (factoryContainer.factory[0] as Promise<Factory<T>>);
        return factory.create();
      }
    }

    const newFactoryContainer: (typeof Container.factories)[keyof typeof Container.factories][0] = {
      metadata,
    } as (typeof Container.factories)[keyof typeof Container.factories][0];
    this.factories[name].push(newFactoryContainer);

    let promiseResolver;
    const promise = new Promise<Factory<T>>((resolve) => {
      promiseResolver = resolve;
    });
    newFactoryContainer.factory = [promise, promiseResolver];

    const factory = await promise;
    newFactoryContainer.factory = factory;
    return factory.create();
  }

  static registerFactory<T>(
    type: Constructable<T> | string,
    factory: Factory<T>,
    metadata: { [key: string]: string },
  ): void {
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
      if (!Array.isArray(factoryContainer.factory)) {
        throw new Error(`Factory ${name} is already registered with given metadata!`);
      }

      const resolve = factoryContainer.factory[1] as (factory: Factory<T>) => void;
      resolve(factory);
      return;
    }

    this.factories[name].push({ factory, metadata });
  }
}
