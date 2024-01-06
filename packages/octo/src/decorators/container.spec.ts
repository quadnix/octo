import { Container } from './container.js';

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
  afterEach(() => {
    Container.reset();
  });

  it('should be able to register factory of a class', async () => {
    Container.registerFactory(Test, TestFactory);

    const test = await Container.get(Test, { metadata: {} });
    expect(test.property).toBe('value');
  });

  it('should not throw error when attempting to register same factory multiple times', async () => {
    expect(() => {
      Container.registerFactory(Test, TestFactory);
      Container.registerFactory(Test, TestFactory);
    }).not.toThrowError();
  });

  it('should be able to register factory of an interface', async () => {
    Container.registerFactory('ITest', TestFactory);

    const test = await Container.get<Test>('ITest', { metadata: {} });
    expect(test.property).toBe('value');
  });

  it('should be able to register factory with a metadata', async () => {
    Container.registerFactory(Test, TestFactory);
    Container.registerFactory(Test, TestFactoryWithMetadata, { metadata: { type: 'metadata' } });

    const test1 = await Container.get(Test, { metadata: {} });
    expect(test1.property).toBe('value');

    const test2 = await Container.get(Test, { metadata: { type: 'metadata' } });
    expect(test2.property).toBe('valueWithMetadata');
  });

  it('should be able to get a default factory', async () => {
    Container.registerFactory(Test, TestFactory);
    Container.registerFactory(Test, TestFactoryWithMetadata, { metadata: { type: 'metadata' } });

    const test1 = await Container.get(Test);
    expect(test1.property).toBe('valueWithMetadata');

    Container.setDefault(Test, TestFactory);

    const test2 = await Container.get(Test);
    expect(test2.property).toBe('value');
  });

  it('should wait for factory to be created when factory does not exist', async () => {
    const promiseToGetTest = Container.get(Test);
    Container.registerFactory(Test, TestFactory);

    const test = await promiseToGetTest;
    expect(test.property).toBe('value');
  });

  it('should wait multiple times on same promise for factory to be created when factory does not exist', async () => {
    const promiseToGetTest1 = Container.get(Test, { metadata: {} });
    const promiseToGetTest2 = Container.get(Test, { metadata: {} });
    Container.registerFactory(Test, TestFactory);

    const test1 = await promiseToGetTest1;
    expect(test1.property).toBe('value');

    const test2 = await promiseToGetTest2;
    expect(test2.property).toBe('value');
  });

  it('should timeout waiting for factory to be created when factory does not exist', async () => {
    Container.setFactoryTimeout(50);

    await expect(async () => {
      await Container.get(Test);
    }).rejects.toMatchInlineSnapshot(`[Error: Timed out waiting for factory Test to resolve!]`);
  });
});
