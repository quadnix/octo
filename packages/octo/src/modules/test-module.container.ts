import type { Constructable } from '../app.type.js';
import { Container } from '../decorators/container.js';
import type { Module } from '../decorators/module.decorator.js';
import { ModuleContainer } from './module.container.js';
import type { IModule } from './module.interface.js';

export class TestModuleContainer {
  static async create(
    modules: {
      hidden?: boolean;
      properties?: Parameters<typeof Module>[0];
      type: Constructable<IModule<unknown>>;
      value?: Constructable<IModule<unknown>>;
    }[],
  ): Promise<void> {
    const moduleContainer = await Container.get(ModuleContainer);

    for (const moduleOverrides of modules) {
      const moduleMetadataIndex = moduleContainer.getModuleMetadataIndex(moduleOverrides.type);
      if (moduleMetadataIndex === -1) {
        moduleContainer.register(moduleOverrides.type, moduleOverrides.properties || {});
      }
      const moduleMetadata = moduleContainer.getModuleMetadata(moduleOverrides.type)!;

      if (moduleOverrides.hidden !== undefined) {
        moduleMetadata.hidden = moduleOverrides.hidden;
      }
      for (const [key, value] of Object.entries(moduleOverrides.properties || {})) {
        moduleMetadata.properties[key] = value;
      }
      if (moduleOverrides.value) {
        moduleMetadata.module = moduleOverrides.value;
      }
    }
  }
}
