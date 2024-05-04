import { ActionInputs, ActionOutputs, Constructable } from '../../app.type.js';
import { Container } from '../../decorators/container.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { IModelAction } from '../../models/model-action.interface.js';
import { InputService } from '../../services/input/input.service.js';
import { Diff } from '../diff/diff.js';
import { AHook } from './hook.abstract.js';

export type PreModelActionCallback = (args: [Diff, ActionInputs], output: ActionOutputs) => Promise<ActionOutputs>;

export class PreModelActionHook extends AHook {
  private static instance: PreModelActionHook;

  private readonly callbacks: {
    [key: string]: { collectInput?: IModelAction['collectInput']; handle: PreModelActionCallback }[];
  } = {};

  private isInstanceOfModelAction(instance: any): instance is IModelAction {
    return 'collectInput' in instance && 'handle' in instance;
  }

  override generateCallbacks(): void {
    for (const m of this.registeredModules) {
      for (const { ACTION_NAME, callback, collectInput } of m.moduleProperties.preModelActionHandles || []) {
        if (!this.callbacks[ACTION_NAME]) {
          this.callbacks[ACTION_NAME] = [];
        }
        this.callbacks[ACTION_NAME].push({ collectInput, handle: callback });
      }
    }
  }

  static getInstance(): PreModelActionHook {
    if (!this.instance) {
      this.instance = new PreModelActionHook();
    }
    return this.instance;
  }

  override registrar(constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor): void {
    if (!this.isInstanceOfModelAction(constructor.prototype)) {
      throw new Error('PreModelActionHook can only be used with ModelAction!');
    }

    const originalMethod = descriptor.value;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    // `self` here references this class, vs `this` references the original method.
    descriptor.value = async function (...args: [Diff, ActionInputs]): Promise<ActionOutputs> {
      const inputService = await Container.get(InputService);

      let output: ActionOutputs = {};
      for (const { collectInput, handle } of self.callbacks[constructor.name] || []) {
        const inputs = collectInput ? collectInput(args[0]) : [];
        const resolvedInputs = inputs.reduce((accumulator, currentValue) => {
          accumulator[currentValue] = inputService.getInput(currentValue);
          if (!accumulator[currentValue]) {
            throw new Error('No matching input found to process module!');
          }
          return accumulator;
        }, {});
        output = await handle([args[0], resolvedInputs], output);
      }

      output = await originalMethod!.apply(this, args);
      return output;
    };
  }
}

@Factory<PreModelActionHook>(PreModelActionHook)
export class PreModelActionHookFactory {
  static async create(): Promise<PreModelActionHook> {
    return PreModelActionHook.getInstance();
  }
}
