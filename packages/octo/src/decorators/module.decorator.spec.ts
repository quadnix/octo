import { jest } from '@jest/globals';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { App } from '../models/app/app.model.js';
import { ModuleContainer } from '../modules/module.container.js';
import type { IModule } from '../modules/module.interface.js';
import { Module } from './module.decorator.js';

class TestModule implements IModule<App> {
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

  afterEach(() => {
    TestContainer.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Module('$$')(TestModule);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when class does not implement IModule', async () => {
    Module('@octo')(TestModuleWithoutOnInit as any);

    await expect(async () => {
      await container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Module does not implement IModule!"`);
  });

  it('should register a module', async () => {
    Module('@octo')(TestModule);

    await container.waitToResolveAllFactories();

    const moduleContainer = await container.get(ModuleContainer);
    expect(moduleContainer.register).toHaveBeenCalledTimes(1);
  });
});
