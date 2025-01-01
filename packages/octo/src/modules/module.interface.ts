import type { UnknownModel } from '../app.type.js';

export interface IModule<S, T extends UnknownModel> {
  onInit(inputs: S): Promise<T | UnknownModel[]>;
}
