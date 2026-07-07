import type { Constructable } from '../../app.type.js';
import { ModuleContainer, type ModuleContainerFactory } from '../../modules/module.container.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../../overlays/overlay-data.repository.js';
import {
  ResourceDataRepository,
  type ResourceDataRepositoryFactory,
} from '../../resources/resource-data.repository.js';
import { EventService } from '../../services/event/event.service.js';
import { InputService, type InputServiceFactory } from '../../services/input/input.service.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../../services/serialization/resource/resource-serialization.service.js';
import { TerraformService, type TerraformServiceFactory } from '../../services/terraform/terraform.service.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';
import { Container } from './container.js';

type FactoryMock<T> = {
  metadata?: { [key: string]: string };
  type: Constructable<T> | string;
  value: T;
};

type TestContainerSubjects = {
  mocks?: FactoryMock<unknown>[];
};
type TestContainerOptions = { factoryTimeoutInMs?: number; force?: boolean };

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
 *
 * @group Functions/Container
 */
export class TestContainer {
  private static originalFactories: Container['factories'];

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
   * - `force?: boolean` performs a complete container reset.
   */
  static async create(subjects: TestContainerSubjects, options?: TestContainerOptions): Promise<Container> {
    if (!TestContainer.originalFactories) {
      TestContainer.originalFactories = Container.getInstance().copyFactories();
    }
    const container = Container.getInstance();

    // Load container with previous factories.
    container.setFactories(this.originalFactories);
    // Reset state of eligible factories.
    // A factory is eligible if it has an internal structure and should be reset on every test.
    await this.bootstrap(container, options?.force ?? false);

    if (options?.factoryTimeoutInMs) {
      container.setFactoryTimeout(options.factoryTimeoutInMs);
    }

    // Override new container with mock factories as instructed.
    for (const mock of subjects.mocks || []) {
      container.unRegisterFactory(mock.type, { metadata: mock.metadata });
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

  /**
   * Bootstrap the Container with the necessary factories internal to Octo.
   * Between test runs, when the container is reset, many of Octo's internal classes must be reset as well.
   * Since these classes are not exposed outside of Octo, we must bootstrap them.
   *
   * Some factories defined in Octo using `@Factory` must be placed here,
   * the exact criteria being any factory that needs to reset its state.
   *
   * Exceptions:
   * - {@link ModelSerializationService}: We do not want to loose class mapping already instantiated via decorators.
   * - {@link ResourceSerializationService}: We do not want to loose class mapping already instantiated via decorators.
   * - {@link TransactionService}: We do not want to loose action mapping already instantiated via decorators.
   */
  private static async bootstrap(container: Container, force: boolean = false): Promise<void> {
    const overlayDataRepository = await container.get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      { args: [true, []] },
    );

    const resourceDataRepository = await container.get<ResourceDataRepository, typeof ResourceDataRepositoryFactory>(
      ResourceDataRepository,
      { args: [true, [], [], []] },
    );

    const inputService = await container.get<InputService, typeof InputServiceFactory>(InputService, { args: [true] });

    const moduleContainer = await container.get<ModuleContainer, typeof ModuleContainerFactory>(ModuleContainer, {
      args: [true],
    });

    const terraformService = await container.get<TerraformService, typeof TerraformServiceFactory>(TerraformService, {
      args: [{}, true],
    });

    if (force) {
      const eventService = await container.get(EventService);

      const modelSerializationService = new ModelSerializationService(inputService);
      container.unRegisterFactory(ModelSerializationService);
      container.registerValue(ModelSerializationService, modelSerializationService);

      const resourceSerializationService = new ResourceSerializationService(resourceDataRepository, inputService);
      container.unRegisterFactory(ResourceSerializationService);
      container.registerValue(ResourceSerializationService, resourceSerializationService);

      const transactionService = new TransactionService(
        eventService,
        inputService,
        moduleContainer,
        overlayDataRepository,
        resourceDataRepository,
        terraformService,
      );
      container.unRegisterFactory(TransactionService);
      container.registerValue(TransactionService, transactionService);
    }
  }
}
