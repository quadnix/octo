import { create } from '../../../test/helpers/test-models.js';
import { App } from '../../models/app/app.model.js';
import { Region } from '../../models/region/region.model.js';
import { InputService } from '../../services/input/input.service.js';
import type { Container } from './container.js';
import { TestContainer } from './test-container.js';

interface ITest {
  property: string;
}

class Test implements ITest {
  readonly property: string;

  constructor(property: string) {
    this.property = property;
  }
}

class TestFactory {
  static async create(): Promise<Test> {
    return new Test('value');
  }
}

class TestFactoryWithMetadata {
  static async create(): Promise<Test> {
    return new Test('valueWithMetadata');
  }
}

describe('Container UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      { mocks: [{ type: InputService, value: new InputService() }] },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('get()', () => {
    it('should timeout waiting for factory to be created when factory does not exist', async () => {
      container.setFactoryTimeout(50);

      container.registerFactory(Test, TestFactory);

      await expect(async () => {
        await container.get(Test, { metadata: { type: 'metadata' } });
      }).rejects.toMatchInlineSnapshot(`[Error: Timed out waiting for factory "Test" to resolve!]`);
    });
  });

  describe('getActionInput()', () => {
    it('should return undefined when no input found', async () => {
      const result = await container.getActionInput('input.test');
      expect(result).toBeUndefined();
    });

    it('should return value when input found', async () => {
      await container.registerActionInput('input.test', 'value');

      const result = await container.getActionInput('input.test');
      expect(result).toBe('value');
    });
  });

  describe('getModel()', () => {
    it('should return undefined when no model found', async () => {
      const result = await container.getModel(App);
      expect(result).toBeUndefined();
    });

    it('should return model when model found', async () => {
      const inputService = await container.get<InputService>(InputService);

      const {
        app: [app],
      } = create({
        app: ['app'],
      });
      inputService.registerModels([app]);

      const result = await container.getModel(App);
      expect(result).toBe(app);
    });

    it('should throw error when multiple models found', async () => {
      const inputService = await container.get<InputService>(InputService);

      const {
        app: [app],
        region: [region1, region2],
      } = create({
        app: ['app'],
        region: ['region1', 'region2:-1'],
      });
      inputService.registerModels([app, region1, region2]);

      await expect(async () => {
        await container.getModel(Region);
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"More than one models found! Use more filters to narrow it down."`,
      );
    });

    it('should return model after applying filters', async () => {
      const inputService = await container.get<InputService>(InputService);

      const {
        app: [app],
        region: [region1, region2],
      } = create({
        app: ['app'],
        region: ['region1', 'region2:-1'],
      });
      inputService.registerModels([app, region1, region2]);

      const result = await container.getModel(Region, [{ key: 'region', value: 'region1' }]);
      expect(result).toBe(region1);
    });
  });

  describe('registerActionInput()', () => {
    it('should be able to register an input', async () => {
      await container.registerActionInput('input.test', 'value');

      const result = await container.getActionInput('input.test');
      expect(result).toBe('value');
    });

    it('should throw error when attempting to register same input multiple times', async () => {
      await expect(async () => {
        await container.registerActionInput('input.test', 'value');
        await container.registerActionInput('input.test', 'value');
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Input "input.test" has already been registered!"`);
    });
  });

  describe('registerFactory()', () => {
    it('should be able to register a factory of type class', async () => {
      container.registerFactory(Test, TestFactory);

      const test = await container.get(Test);
      expect(test.property).toBe('value');
    });

    it('should be able to register a factory of type string', async () => {
      container.registerFactory('Test', TestFactory);

      const test = await container.get(Test);
      expect(test.property).toBe('value');
    });

    it('should be able to register a factory with a metadata', async () => {
      container.registerFactory(Test, TestFactory);
      container.registerFactory(Test, TestFactoryWithMetadata, { metadata: { type: 'metadata' } });

      const test1 = await container.get(Test);
      expect(test1.property).toBe('value');

      const test2 = await container.get(Test, { metadata: { type: 'metadata' } });
      expect(test2.property).toBe('valueWithMetadata');
    });

    it('should throw error when attempting to register same factory multiple times', async () => {
      expect(() => {
        container.registerFactory(Test, TestFactory);
        container.registerFactory(Test, TestFactory);
      }).toThrowErrorMatchingInlineSnapshot(`"Factory "Test" has already been registered!"`);
    });

    it('should timeout waiting for factory to be created when factory does not exist', async () => {
      container.setFactoryTimeout(50);

      await expect(async () => {
        await container.get(Test);
      }).rejects.toMatchInlineSnapshot(`[Error: Timed out waiting for factory "Test" to resolve!]`);
    });

    it('should wait for factory to be created when factory does not exist', async () => {
      const promiseToGetTest = container.get(Test);
      container.registerFactory(Test, TestFactory);

      const test = await promiseToGetTest;
      expect(test.property).toBe('value');
    });

    it('should wait multiple times on same promise for factory to be created when factory does not exist', async () => {
      const promiseToGetTest1 = container.get(Test, { metadata: {} });
      const promiseToGetTest2 = container.get(Test, { metadata: {} });
      container.registerFactory(Test, TestFactory);

      const test1 = await promiseToGetTest1;
      expect(test1.property).toBe('value');

      const test2 = await promiseToGetTest2;
      expect(test2.property).toBe('value');
    });
  });

  describe('registerValue()', () => {
    it('should be able to register a value of type class', async () => {
      container.registerValue(Test, new Test('value'));

      const test = await container.get(Test);
      expect(test.property).toBe('value');
    });

    it('should be able to register a value of type string', async () => {
      container.registerValue('Test', new Test('value'));

      const test = await container.get(Test);
      expect(test.property).toBe('value');
    });

    it('should be able to register a value with a metadata', async () => {
      container.registerValue(Test, new Test('value'));
      container.registerValue(Test, new Test('valueWithMetadata'), { metadata: { type: 'metadata' } });

      const test1 = await container.get(Test);
      expect(test1.property).toBe('value');

      const test2 = await container.get(Test, { metadata: { type: 'metadata' } });
      expect(test2.property).toBe('valueWithMetadata');
    });
  });
});
