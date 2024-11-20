import type { ModuleSchema, UnknownModel } from '../app.type.js';
import type { IModule } from './module.interface.js';

export abstract class AModule<S, T extends UnknownModel> implements IModule<S, T> {
  static readonly MODULE_PACKAGE: string;

  static readonly MODULE_SCHEMA: ModuleSchema<AModule<any, any>>;

  abstract onInit(inputs: S): Promise<T>;
}
