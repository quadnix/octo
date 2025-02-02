import { AModule, App, Module } from '@quadnix/octo';
import { AppModuleSchema } from './index.schema.js';

@Module<AppModule>('@octo', AppModuleSchema)
export class AppModule extends AModule<AppModuleSchema, App> {
  async onInit(inputs: AppModuleSchema): Promise<App> {
    return new App(inputs.name);
  }
}
