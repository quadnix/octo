import { AModule, App, Module } from '@quadnix/octo';
import { SimpleAppModuleSchema } from './index.schema.js';

/**
 * `SimpleAppModule` is a simple module to provide an implementation for the `App` model.
 * It creates the root node of your infrastructure's model graph, but does not create any resources.
 *
 * @example
 * TypeScript
 * ```ts
 * import { SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
 *
 * octo.loadModule(SimpleAppModule, 'my-app-module', { name: 'test-app' });
 * ```
 *
 * @group Modules/App/SimpleApp
 *
 * @see {@link SimpleAppModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link App} to learn more about the `App` model.
 */
@Module<SimpleAppModule>('@octo', SimpleAppModuleSchema)
export class SimpleAppModule extends AModule<SimpleAppModuleSchema, App> {
  async onInit(inputs: SimpleAppModuleSchema): Promise<App> {
    return new App(inputs.name);
  }
}
