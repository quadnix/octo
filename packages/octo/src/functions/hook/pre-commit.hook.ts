import type { Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { AHook } from './hook.abstract.js';

export type PreCommitCallback = (...args: any[]) => Promise<void>;

export class PreCommitHook extends AHook {
  private static instance: PreCommitHook;

  private readonly callbacks: PreCommitCallback[] = [];

  override generateCallbacks(): void {
    for (const m of this.registeredModules) {
      for (const { callback } of m.moduleProperties.preCommitHandles || []) {
        this.callbacks.push(callback);
      }
    }
  }

  static getInstance(): PreCommitHook {
    if (!this.instance) {
      this.instance = new PreCommitHook();
    }
    return this.instance;
  }

  override registrar(constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    // `self` here references this class, vs `this` references the original method.
    descriptor.value = async function (...args: any[]): Promise<any> {
      for (const callback of self.callbacks) {
        await callback.apply(this, args);
      }

      return await originalMethod!.apply(this, args);
    };
  }
}

@Factory<PreCommitHook>(PreCommitHook)
export class PreCommitHookFactory {
  static async create(): Promise<PreCommitHook> {
    return PreCommitHook.getInstance();
  }
}
