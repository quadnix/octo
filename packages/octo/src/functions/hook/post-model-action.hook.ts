import { ActionOutputs, Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { IModelAction } from '../../models/model-action.interface.js';
import { AHook } from './hook.abstract.js';

export type PostModelActionCallback = (output: ActionOutputs) => Promise<ActionOutputs>;

export class PostModelActionHook extends AHook {
  private static instance: PostModelActionHook;

  private readonly callbacks: { [key: string]: PostModelActionCallback[] } = {};

  private isInstanceOfModelAction(instance: any): instance is IModelAction {
    return 'collectInput' in instance && 'handle' in instance;
  }

  override generateCallbacks(): void {
    for (const m of this.registeredModules) {
      for (const { ACTION_NAME, callback } of m.moduleProperties.postModelActionHandles || []) {
        if (!this.callbacks[ACTION_NAME]) {
          this.callbacks[ACTION_NAME] = [];
        }
        this.callbacks[ACTION_NAME].push(callback);
      }
    }
  }

  static getInstance(): PostModelActionHook {
    if (!this.instance) {
      this.instance = new PostModelActionHook();
    }
    return this.instance;
  }

  override registrar(constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor): void {
    if (!this.isInstanceOfModelAction(constructor.prototype)) {
      throw new Error('PostModelActionHook can only be used with ModelAction!');
    }

    const originalMethod = descriptor.value;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    // `self` here references this class, vs `this` references the original method.
    descriptor.value = async function (...args: any[]): Promise<ActionOutputs> {
      let output: ActionOutputs = await originalMethod!.apply(this, args);
      for (const callback of self.callbacks[constructor.name] || []) {
        output = await callback(output);
      }
      return output;
    };
  }
}

@Factory<PostModelActionHook>(PostModelActionHook)
export class PostModelActionHookFactory {
  static async create(): Promise<PostModelActionHook> {
    return PostModelActionHook.getInstance();
  }
}
