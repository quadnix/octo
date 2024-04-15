import { Constructable } from '../../app.type.js';
import { AHook } from './hook.abstract.js';

export type PreCommitCallback = (...args: any[]) => Promise<void>;

export class PreCommitHandleHook extends AHook {
  private static readonly callbacks: PreCommitCallback[] = [];

  static register(callback: PreCommitCallback): PreCommitHandleHook {
    this.callbacks.push(callback);
    return this;
  }

  static override registrar(
    constructor: Constructable<unknown>,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): void {
    const originalMethod = descriptor.value;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    // `self` here references PreCommitHandleHook, vs `this` references the original method.
    descriptor.value = async function (...args: any[]): Promise<any> {
      for (const callback of self.callbacks) {
        await callback.apply(this, args);
      }

      return await originalMethod!.apply(this, args);
    };
  }
}
