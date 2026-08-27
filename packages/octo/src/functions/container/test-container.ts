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
 * An isolated {@link Container} for tests.
 *
 * The Container is a process-wide singleton, which makes it awkward to mock. TestContainer solves
 * that: create one in `beforeEach()` and it takes over the Container for that test, letting you
 * replace any factory with a stub. `reset()` in `afterEach()` puts it back.
 *
 * :::info Info
 * A test framework like Jest runs test *files* in parallel across cores, and the `it()` blocks
 * within a file serially. So a TestContainer never leaks into a test running in parallel.
 * :::
 *
 * @example
 * ```ts
 * beforeEach(async () => {
 *   container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
 * });
 *
 * afterEach(async () => {
 *   await TestContainer.reset();
 * });
 * ```
 *
 * @group Functions/Container
 */
export class TestContainer {
  private static originalFactories: Container['factories'];

  /**
   * To take over the Container for one test, replacing the factories you name.
   *
   * @example
   * ```ts
   * await TestContainer.create({
   *   mocks: [
   *     { type: MyClass, value: jest.fn() },
   *     { metadata: { key: 'value' }, type: AnotherClass, value: new AnotherClass() },
   *   ],
   * }, { factoryTimeoutInMs: 500 });
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
      container.replaceValue(mock.type, mock.value, { metadata: mock.metadata });
    }

    return container;
  }

  /**
   * To destroy every factory in the Container. Because it destroys the whole Container and not only
   * the mocks, it must always be called in your teardown block - otherwise the next test starts
   * against a Container this test left behind.
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
