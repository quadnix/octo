import { AModule, App, Module, Schema } from '@quadnix/octo';

export class AppModuleSchema {
  name = Schema<string>();
}

@Module<AppModule>('@octo', AppModuleSchema)
export class AppModule extends AModule<AppModuleSchema, App> {
  async onInit(inputs: AppModuleSchema): Promise<App> {
    return new App(inputs.name);
  }
}
