import type { Constructable } from '../../app.type.js';
import { Container } from './container.js';

type Factory<T> = { create: () => Promise<T> };

type FactoryMock<T> = {
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

/**
 * The TestContainer class is an isolated {@link Container} for tests.
 *
 * :::info Info
 * A test framework like Jest, supports parallel test executions in different cores of the machine.
 * Each test is a single test file, whose `it()` blocks are executed serially.
 * :::
 *
 * TestContainer is created with testing framework's parallel execution in mind.
 * A TestContainer should be created in the `beforeAll()` block of your test,
 * which modifies the Container for the duration of the test.
 * This TestContainer does not affect other tests in parallel since they are on a separate machine core.
 * Once tests are done executing, the `afterAll()` block cleans up the Container.
 */
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

  /**
   * The `TestContainer.create()` method allows you to mock factories.
   *
   * @example
   * ```ts
   * beforeAll(async () => {
   *   await TestContainer.create({
   *     importFrom: [OctoAwsCdkPackageMock],
   *     mocks: [
   *       { type: MyClass, value: jest.fn() },
   *       { type: AnotherClass, value: new AnotherClass() },
   *     ],
   *   }, { factoryTimeoutInMs: 500 });
   * });
   *
   * ```
   * @param subjects The subjects being mocked.
   * - `importFrom` is an array of {@link IPackageMock} classes, to import custom mocks,
   * such as from octo-aws-cdk package - [OctoAwsCdkPackageMock](/api/octo-aws-cdk/class/OctoAwsCdkPackageMock).
   * - `mocks` is an array of objects, to override the default factories.
   *   - Use `type: Constructable<T> | string` to identify the class being mocked.
   *   - Use `value: T` to provide the mocked value.
   * @param options Options to configure TestContainer.
   * - `factoryTimeoutInMs?: number` is to override the default container timeout.
   */
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
      if (!oldFactories[mockClassName]) {
        oldFactories[mockClassName] = { factory: this.createTestFactory(mock) };
      } else {
        oldFactories[mockClassName].factory = this.createTestFactory(mock);
      }
    }

    for (const name in oldFactories) {
      Container.registerFactory(name, oldFactories[name].factory as Factory<unknown>);
    }
  }

  /**
   * The `TestContainer.reset()` method will completely destroy all factories from the Container.
   * Because the entire Container is destroyed, and not just the mocks,
   * it must always be called in your `afterAll()` block.
   *
   * @example
   * ```ts
   * afterAll(async () => {
   *   await TestContainer.reset();
   * });
   * ```
   */
  static async reset(): Promise<void> {
    for (const mock of this.packageMocks) {
      await mock.destroy();
    }
    Container.reset();
  }
}
