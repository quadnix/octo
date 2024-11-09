import type { IModule } from './module.interface.js';

export abstract class AModule<I extends { [key: string]: unknown }, T> implements IModule<I, T> {
  static readonly MODULE_PACKAGE: string;

  abstract collectInputs(): string[];

  abstract onInit(inputs: Partial<I>): Promise<T>;
}
