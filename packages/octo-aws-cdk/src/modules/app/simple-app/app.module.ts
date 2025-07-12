import { AModule, App, Module } from '@quadnix/octo';
import { AppModuleSchema } from './index.schema.js';

/**
 * `AppModule` is a simple AWS based module to provide an implementation for the `App` model.
 * It creates the root node of your infrastructure's model graph, but does not create any resources.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
 *
 * octo.loadModule(AppModule, 'my-module', { name: 'test-app' });
 * ```
 *
 * @group Modules/App/SimpleApp
 *
 * @see {@link AppModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link App} to learn more about the `App` model.
 */
@Module<AppModule>('@octo', AppModuleSchema)
export class AppModule extends AModule<AppModuleSchema, App> {
  async onInit(inputs: AppModuleSchema): Promise<App> {
    return new App(inputs.name);
  }
}
