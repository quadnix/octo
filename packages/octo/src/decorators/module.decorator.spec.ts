import { jest } from '@jest/globals';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { App } from '../models/app/app.model.js';
import { AModule } from '../modules/module.abstract.js';
import { ModuleContainer } from '../modules/module.container.js';
import { Module } from './module.decorator.js';

class TestModuleSchema {}

class TestModule extends AModule<TestModuleSchema, App> {
  async onInit(): Promise<App> {
    return new App('test');
  }
}

class TestModuleWithoutOnInit {}

describe('Module UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            type: ModuleContainer,
            value: {
              register: jest.fn(),
            },
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(async () => {
    // @ts-expect-error static members are readonly.
    TestModule['MODULE_PACKAGE'] = undefined;
    // @ts-expect-error static members are readonly.
    TestModule['MODULE_SCHEMA'] = undefined;

    await TestContainer.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Module<TestModule>('$$', TestModuleSchema)(TestModule);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when class does not extend AModule', async () => {
    await expect(async () => {
      Module<TestModule>('@octo', TestModuleSchema)(TestModuleWithoutOnInit as any);
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Class "TestModuleWithoutOnInit" must extend the AModule class!"`);
  });

  it('should set static members', async () => {
    expect(TestModule.MODULE_PACKAGE).toBeUndefined();
    expect(TestModule.MODULE_SCHEMA).toBeUndefined();

    Module<TestModule>('@octo', TestModuleSchema)(TestModule);

    expect(TestModule.MODULE_PACKAGE).toBe('@octo');
    expect(TestModule.MODULE_SCHEMA).toBe(TestModuleSchema);
  });

  it('should register a module', async () => {
    Module<TestModule>('@octo', TestModuleSchema)(TestModule);

    await container.waitToResolveAllFactories();

    const moduleContainer = await container.get(ModuleContainer);
    expect(moduleContainer.register).toHaveBeenCalledTimes(1);
  });
});
