import { Constructable } from '../app.type.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { Container } from './container.js';

type Factory<T> = { create: () => Promise<T> };

type FactoryMock<T> = {
  metadata?: { [key: string]: string };
  type: Constructable<T> | string;
  value: T;
};

type TestContainerOptions = { factoryTimeoutInMs?: number };

export class TestContainer {
  private static createTestFactory<T>(mock: FactoryMock<T>): Factory<T> {
    return class {
      static mock: FactoryMock<T> = mock;

      static async create(): Promise<T> {
        return this.mock.value;
      }
    };
  }

  static create(mocks: FactoryMock<unknown>[], options: TestContainerOptions): void {
    const oldFactories = { ...Container['factories'] };
    Container.reset();

    if (options.factoryTimeoutInMs) {
      Container.setFactoryTimeout(options.factoryTimeoutInMs);
    }

    for (const mock of mocks) {
      const mockClassName = typeof mock.type === 'string' ? mock.type : mock.type.name;
      const mockMetadata = mock.metadata || {};
      const registeredFactories = oldFactories[mockClassName] || [];
      const matchingFactoryIndex = registeredFactories.findIndex((f) =>
        DiffUtility.isObjectDeepEquals(f.metadata, mockMetadata),
      );

      if (matchingFactoryIndex > -1) {
        oldFactories[mockClassName][matchingFactoryIndex].factory = this.createTestFactory(mock);
      }
    }

    for (const name in oldFactories) {
      for (const oldFactory of oldFactories[name]) {
        Container.registerFactory(name, oldFactory.factory as Factory<unknown>, { metadata: oldFactory.metadata });
        if (oldFactory.default) {
          Container.setDefault(name, oldFactory.factory as Factory<unknown>);
        }
      }
    }
  }
}
