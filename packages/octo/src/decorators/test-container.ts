import type { Constructable } from '../app.type.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { Container } from './container.js';

type Factory<T> = { create: () => Promise<T> };

type FactoryMock<T> = {
  metadata?: { [key: string]: string };
  type: Constructable<T> | string;
  value: T;
};

type TestContainerSubjects = {
  importFrom?: Constructable<IPackageMock>[];
  mocks?: FactoryMock<unknown>[];
};
type TestContainerOptions = { factoryTimeoutInMs?: number };

export interface IPackageMock {
  destroy: () => Promise<void>;

  getMocks: () => FactoryMock<unknown>[];

  init(): Promise<void>;
}

export class TestContainer {
  private static packageMocks: IPackageMock[] = [];

  private static createTestFactory<T>(mock: FactoryMock<T>): Factory<T> {
    return class {
      static mock: FactoryMock<T> = mock;

      static async create(): Promise<T> {
        return this.mock.value;
      }
    };
  }

  static async create(subjects: TestContainerSubjects, options?: TestContainerOptions): Promise<void> {
    const oldFactories = { ...Container['factories'] };
    Container.reset();

    if (options?.factoryTimeoutInMs) {
      Container.setFactoryTimeout(options.factoryTimeoutInMs);
    }

    const importedMocks: FactoryMock<unknown>[] = [];
    for (const mockClass of subjects.importFrom || []) {
      const mock = new mockClass();
      await mock.init();

      importedMocks.push(...mock.getMocks());
      this.packageMocks.push(mock);
    }

    subjects.mocks = [...importedMocks, ...(subjects.mocks || [])];

    for (const mock of subjects.mocks) {
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

  static async reset(): Promise<void> {
    for (const mock of this.packageMocks) {
      await mock.destroy();
    }
    Container.reset();
  }
}
