import type { Constructable, ModuleSchemaInputs, UnknownModel, UnknownModule } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { Schema } from '../../functions/schema/schema.js';
import { App } from '../../models/app/app.model.js';
import { AModule } from '../../modules/module.abstract.js';
import { ModuleContainer } from '../../modules/module.container.js';
import { TestOverlay } from './test-classes.js';

class TestAppModuleSchema {
  name = Schema<string>();
}

class TestAppOverlayModuleSchema {
  anchorName = Schema<string>();
  app = Schema<App>();
}

export function createAppModule(): Constructable<AModule<TestAppModuleSchema, App>> & {
  setClassName(className: string): Constructable<AModule<TestAppModuleSchema, App>>;
} {
  return class extends AModule<TestAppModuleSchema, App> {
    static override readonly MODULE_PACKAGE = '@octo';

    static override readonly MODULE_SCHEMA = TestAppModuleSchema;

    async onInit(inputs: TestAppModuleSchema): Promise<App> {
      return new App(inputs.name);
    }

    static setClassName(className: string): Constructable<AModule<TestAppModuleSchema, App>> {
      Object.defineProperty(this, 'name', { value: className });
      return this;
    }
  };
}

export function createAppOverlayModule(): Constructable<AModule<TestAppOverlayModuleSchema, TestOverlay>> & {
  setClassName(className: string): Constructable<AModule<TestAppOverlayModuleSchema, TestOverlay>>;
} {
  return class extends AModule<TestAppOverlayModuleSchema, TestOverlay> {
    static override readonly MODULE_PACKAGE = '@octo';

    static override readonly MODULE_SCHEMA = TestAppOverlayModuleSchema;

    async onInit(inputs: TestAppOverlayModuleSchema): Promise<TestOverlay> {
      const anchor = inputs.app.getAnchor(inputs.anchorName)!;
      return new TestOverlay('test-overlay', {}, [anchor]);
    }

    static setClassName(className: string): Constructable<AModule<TestAppOverlayModuleSchema, TestOverlay>> {
      Object.defineProperty(this, 'name', { value: className });
      return this;
    }
  };
}

export async function runModule<M extends UnknownModule>(
  container: Container,
  { inputs, moduleId, type }: { inputs: ModuleSchemaInputs<M>; moduleId: string; type: Constructable<M> },
): Promise<{ [key: string]: UnknownModel }> {
  const moduleContainer = await container.get(ModuleContainer);

  if (moduleContainer.getMetadataIndex(type) === -1) {
    moduleContainer.register(type, { packageName: (type as unknown as typeof AModule).MODULE_PACKAGE });
  }
  moduleContainer.load(type, moduleId, inputs);

  return (await moduleContainer.apply()) as { [key: string]: UnknownModel };
}
