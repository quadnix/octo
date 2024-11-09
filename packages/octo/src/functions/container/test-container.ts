import type { Constructable } from '../../app.type.js';
import { Container } from './container.js';

type FactoryMock<T> = {
  metadata?: { [key: string]: string };
  type: Constructable<T> | string;
  value: T;
};

type TestContainerSubjects = {
  mocks?: FactoryMock<unknown>[];
};
type TestContainerOptions = { factoryTimeoutInMs?: number };

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
  /**
   * The `TestContainer.create()` method allows you to mock factories.
   *
   * @example
   * ```ts
   * beforeAll(async () => {
   *   await TestContainer.create({
   *     mocks: [
   *       { type: MyClass, value: jest.fn() },
   *       { metadata: { key: 'value' }, type: AnotherClass, value: new AnotherClass() },
   *     ],
   *   }, { factoryTimeoutInMs: 500 });
   * });
   *
   * ```
   * @param subjects The subjects being mocked.
   * - `mocks` is an array of objects, to override the default factories.
   *   - Use `metadata?: { [key: string]: string }` to identify the factory being mocked.
   *   - Use `type: Constructable<T> | string` to identify the class being mocked.
   *   - Use `value: T` to provide the mocked value.
   * @param options Options to configure TestContainer.
   * - `factoryTimeoutInMs?: number` is to override the default container timeout.
   */
  static async create(subjects: TestContainerSubjects, options?: TestContainerOptions): Promise<Container> {
    const container = Container.getInstance(true);

    if (options?.factoryTimeoutInMs) {
      container.setFactoryTimeout(options.factoryTimeoutInMs);
    }

    for (const mock of subjects.mocks || []) {
      container.registerValue(mock.type, mock.value, { metadata: mock.metadata });
    }

    return container;
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
    Container.getInstance().reset();
  }
}
