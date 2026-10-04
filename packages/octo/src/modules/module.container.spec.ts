import { jest } from '@jest/globals';
import { App } from '../models/app/app.model.js';
import type { OverlayDataRepository } from '../overlays/overlay-data.repository.js';
import type { EventService } from '../services/event/event.service.js';
import type { InputService } from '../services/input/input.service.js';
import { AModule } from './module.abstract.js';
import { ModuleContainer } from './module.container.js';

class TestModuleSchema {}

class TestAppModule extends AModule<TestModuleSchema, App> {
  static override readonly MODULE_PACKAGE = '@octo';
  static override readonly MODULE_SCHEMA = TestModuleSchema;

  async onInit(): Promise<App> {
    return new App('test');
  }
}

class OtherTestAppModule extends TestAppModule {}

describe('ModuleContainer UT', () => {
  let moduleContainer: ModuleContainer;

  beforeEach(() => {
    const inputService = { registerInput: jest.fn() } as unknown as InputService;
    moduleContainer = new ModuleContainer({} as EventService, inputService, {} as OverlayDataRepository);
    moduleContainer.register(TestAppModule, { packageName: '@octo' });
    moduleContainer.register(OtherTestAppModule, { packageName: '@octo' });
  });

  describe('load()', () => {
    it('should load a module again under its id, with the same inputs, as a no-op', () => {
      moduleContainer.load(TestAppModule, 'app-module', { name: 'app' } as never);
      moduleContainer.load(TestAppModule, 'app-module', { name: 'app' } as never);

      expect(moduleContainer.getMetadata(TestAppModule)!.instances).toHaveLength(1);
    });

    it('should throw when a module id is loaded again with other inputs', () => {
      moduleContainer.load(TestAppModule, 'app-module', { name: 'app' } as never);

      expect(() =>
        moduleContainer.load(TestAppModule, 'app-module', { name: 'other-app' } as never),
      ).toThrowErrorMatchingInlineSnapshot(`"Module id "app-module" is already in use!"`);
    });

    it('should throw when a module id is loaded again by another module', () => {
      moduleContainer.load(TestAppModule, 'app-module', { name: 'app' } as never);

      expect(() =>
        moduleContainer.load(OtherTestAppModule, 'app-module', { name: 'app' } as never),
      ).toThrowErrorMatchingInlineSnapshot(`"Module id "app-module" is already in use!"`);
    });

    it('should throw when a module id contains a dot', () => {
      expect(() =>
        moduleContainer.load(TestAppModule, 'image-tag-0.0.1', { name: 'app' } as never),
      ).toThrowErrorMatchingInlineSnapshot(`"Module id "image-tag-0.0.1" cannot contain "."!"`);
    });
  });
});
