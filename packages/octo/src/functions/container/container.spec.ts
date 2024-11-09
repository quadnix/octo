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
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
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
