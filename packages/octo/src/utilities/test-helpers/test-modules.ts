import type { Constructable, ModuleSchemaInputs, UnknownModel, UnknownModule } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { Schema } from '../../functions/schema/schema.js';
import { App } from '../../models/app/app.model.js';
import { AModule } from '../../modules/module.abstract.js';
import { ModuleContainer } from '../../modules/module.container.js';
import { TestOverlay } from './test-classes.js';

/**
 * The module a test helper ties a node to when its caller names none.
 *
 * @internal
 */
export const TEST_MODULE_ID = 'test-module';

/**
 * @internal
 */
class TestAppModuleSchema {
  name = Schema<string>();
}

/**
 * @internal
 */
class TestAppOverlayModuleSchema {
  anchorName = Schema<string>();
  app = Schema<App>();
}

/**
 * @internal
 */
export function createAppModule(): Constructable<AModule<TestAppModuleSchema, App>> & {
  setClassName(className: string): Constructable<AModule<TestAppModuleSchema, App>>;
} {
  return class extends AModule<TestAppModuleSchema, App> {
    static override readonly MODULE_PACKAGE = '@octo';

    static override readonly MODULE_SCHEMA = TestAppModuleSchema;

    /**
     * @internal
     */
    static setClassName(className: string): Constructable<AModule<TestAppModuleSchema, App>> {
      Object.defineProperty(this, 'name', { value: className });
      return this;
    }

    /**
     * @internal
     */
    async onInit(inputs: TestAppModuleSchema): Promise<App> {
      return new App(inputs.name);
    }
  };
}

/**
 * @internal
 */
export function createAppOverlayModule(): Constructable<AModule<TestAppOverlayModuleSchema, TestOverlay>> & {
  setClassName(className: string): Constructable<AModule<TestAppOverlayModuleSchema, TestOverlay>>;
} {
  return class extends AModule<TestAppOverlayModuleSchema, TestOverlay> {
    static override readonly MODULE_PACKAGE = '@octo';

    static override readonly MODULE_SCHEMA = TestAppOverlayModuleSchema;

    /**
     * @internal
     */
    static setClassName(className: string): Constructable<AModule<TestAppOverlayModuleSchema, TestOverlay>> {
      Object.defineProperty(this, 'name', { value: className });
      return this;
    }

    /**
     * @internal
     */
    async onInit(inputs: TestAppOverlayModuleSchema): Promise<TestOverlay> {
      const anchor = inputs.app.getAnchor(inputs.anchorName)!;
      return new TestOverlay('test-overlay', {}, [anchor]);
    }
  };
}

/**
 * @internal
 */
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
