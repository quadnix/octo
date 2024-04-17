import { Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { AHook } from './hook.abstract.js';

export type PreCommitCallback = (...args: any[]) => Promise<void>;

export class PreCommitHandleHook extends AHook {
  private readonly callbacks: PreCommitCallback[] = [];

  override generateCallbacks(): void {
    for (const m of this.registeredModules) {
      for (const { callback } of m.moduleProperties.preCommitHandles || []) {
        this.callbacks.push(callback);
      }
    }
  }

  override registrar(constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor): void {
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

@Factory<PreCommitHandleHook>(PreCommitHandleHook)
export class PreCommitHandleHookFactory {
  private static instance: PreCommitHandleHook;

  static async create(): Promise<PreCommitHandleHook> {
    if (!this.instance) {
      this.instance = new PreCommitHandleHook();
    }
    return this.instance;
  }
}
