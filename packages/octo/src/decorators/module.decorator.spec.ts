import { jest } from '@jest/globals';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { App } from '../models/app/app.model.js';
import { AModule } from '../modules/module.abstract.js';
import { ModuleContainer } from '../modules/module.container.js';
import { Module } from './module.decorator.js';

class TestModule extends AModule<{ key: 'value' }, App> {
  override collectInputs(): string[] {
    return [];
  }

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

    await TestContainer.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Module('$$')(TestModule);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when class does not extend AModule', async () => {
    await expect(async () => {
      Module('@octo')(TestModuleWithoutOnInit as any);
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Class "TestModuleWithoutOnInit" must extend the AModule class!"`);
  });

  it('should set static members', async () => {
    expect(TestModule.MODULE_PACKAGE).toBeUndefined();

    Module('@octo')(TestModule);

    expect(TestModule.MODULE_PACKAGE).toBe('@octo');
  });

  it('should register a module', async () => {
    Module('@octo')(TestModule);

    await container.waitToResolveAllFactories();

    const moduleContainer = await container.get(ModuleContainer);
    expect(moduleContainer.register).toHaveBeenCalledTimes(1);
  });
});
