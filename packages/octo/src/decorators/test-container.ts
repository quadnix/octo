import { Constructable } from '../app.type.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { PostModelActionHook } from '../functions/hook/post-model-action.hook.js';
import { PreCommitHook } from '../functions/hook/pre-commit.hook.js';
import { Container } from './container.js';
import { Module } from './module.decorator.js';

type Factory<T> = { create: () => Promise<T> };

type FactoryMock<T> = {
  metadata?: { [key: string]: string };
  type: Constructable<T> | string;
  value: T;
};

type TestContainerSubjects = {
  mocks?: FactoryMock<unknown>[];
  modules?: {
    name: string;
    value:
      | Constructable<unknown>
      | (Omit<Parameters<typeof Module>[0], 'imports'> & { imports?: (Constructable<unknown> | string)[] });
  }[];
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

  static create(subjects: TestContainerSubjects, options?: TestContainerOptions): void {
    const oldFactories = { ...Container['factories'] };
    Container.reset();

    if (options?.factoryTimeoutInMs) {
      Container.setFactoryTimeout(options.factoryTimeoutInMs);
    }

    for (const mock of subjects.mocks || []) {
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

    for (const module of subjects.modules || []) {
      if (typeof module.value === 'object') {
        const imports = (module.value.imports || []).map((i) =>
          typeof i === 'string' ? { name: i } : i,
        ) as Constructable<unknown>[];

        if ((module.value.postModelActionHandles || []).length > 0) {
          PostModelActionHook.getInstance().register(module.name, {
            imports,
            postModelActionHandles: module.value.postModelActionHandles,
          });
        }

        if ((module.value.preCommitHandles || []).length > 0) {
          PreCommitHook.getInstance().register(module.name, {
            imports,
            preCommitHandles: module.value.preCommitHandles,
          });
        }
      }
    }
  }
}
