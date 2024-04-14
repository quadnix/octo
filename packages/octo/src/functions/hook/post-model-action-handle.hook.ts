import { ActionOutputs, Constructable } from '../../app.type.js';
import { IModelAction } from '../../models/model-action.interface.js';
import { AHook } from './hook.abstract.js';

export type PostModelActionCallback = (output: ActionOutputs) => Promise<ActionOutputs>;
type PostModelActionMethodSignature = (...args: any[]) => Promise<ActionOutputs>;

export class PostModelActionHandleHook extends AHook {
  private static readonly callbacks: { [key: string]: PostModelActionCallback[] } = {};

  private static isInstanceOfModelAction(instance: any): instance is IModelAction {
    return 'collectInput' in instance && 'handle' in instance;
  }

  static register(actionName: string, callback: PostModelActionCallback): PostModelActionHandleHook {
    if (!this.callbacks[actionName]) {
      this.callbacks[actionName] = [];
    }
    this.callbacks[actionName].push(callback);
    return this;
  }

  static override registrar(
    constructor: Constructable<unknown>,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<PostModelActionMethodSignature>,
  ): void {
    if (!this.isInstanceOfModelAction(constructor.prototype)) {
      throw new Error('PostModelActionHandleHook can only be used with ModelAction!');
    }

    const originalMethod = descriptor.value;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    // `self` here references PostModelActionHandleHook, vs `this` references the original method.
    descriptor.value = async function (...args: any[]): Promise<ActionOutputs> {
      let output: ActionOutputs = await originalMethod!.apply(this, args);
      for (const callback of self.callbacks[constructor.name] || []) {
        output = await callback(output);
      }
      return output;
    };
  }
}
