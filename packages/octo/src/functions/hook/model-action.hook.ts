import { ActionInputs, ActionOutputs } from '../../app.type.js';
import { Container } from '../../decorators/container.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { IModelAction } from '../../models/model-action.interface.js';
import { InputService } from '../../services/input/input.service.js';
import { Diff } from '../diff/diff.js';
import { AHook } from './hook.abstract.js';

export class ModelActionHook extends AHook {
  private static instance: ModelActionHook;

  private readonly postModelActionHooks: {
    [key: string]: { collectInput?: IModelAction['collectInput']; handle: IModelAction['handle'] }[];
  } = {};
  private readonly preModelActionHooks: {
    [key: string]: { collectInput?: IModelAction['collectInput']; handle: IModelAction['handle'] }[];
  } = {};

  override collectHooks(): void {
    for (const m of this.registeredModules) {
      for (const { ACTION_NAME, collectInput, handle } of m.moduleProperties.postModelActionHooks || []) {
        if (!this.postModelActionHooks[ACTION_NAME]) {
          this.postModelActionHooks[ACTION_NAME] = [];
        }
        this.postModelActionHooks[ACTION_NAME].push({ collectInput, handle });
      }

      for (const { ACTION_NAME, collectInput, handle } of m.moduleProperties.preModelActionHooks || []) {
        if (!this.preModelActionHooks[ACTION_NAME]) {
          this.preModelActionHooks[ACTION_NAME] = [];
        }
        this.preModelActionHooks[ACTION_NAME].push({ collectInput, handle });
      }
    }
  }

  static getInstance(): ModelActionHook {
    if (!this.instance) {
      this.instance = new ModelActionHook();
    }
    return this.instance;
  }

  override registrar(modelAction: IModelAction): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalHandleMethod = modelAction.handle;

    modelAction.handle = async function (...args: [Diff, ActionInputs, ActionOutputs]): Promise<ActionOutputs> {
      const inputService = await Container.get(InputService);

      let output = args[2] || {};

      for (const { collectInput, handle } of self.preModelActionHooks[modelAction.ACTION_NAME] || []) {
        const inputs = collectInput ? collectInput(args[0]) : [];
        const resolvedInputs = inputs.reduce((accumulator, currentValue) => {
          accumulator[currentValue] = inputService.getInput(currentValue);
          if (!accumulator[currentValue]) {
            throw new Error('No matching input found to process module!');
          }
          return accumulator;
        }, {});
        output = await handle.apply(this, [args[0], resolvedInputs, output]);
      }

      output = await originalHandleMethod.apply(this, [args[0], args[1], output]);

      for (const { collectInput, handle } of self.postModelActionHooks[modelAction.ACTION_NAME] || []) {
        const inputs = collectInput ? collectInput(args[0]) : [];
        const resolvedInputs = inputs.reduce((accumulator, currentValue) => {
          accumulator[currentValue] = inputService.getInput(currentValue);
          if (!accumulator[currentValue]) {
            throw new Error('No matching input found to process module!');
          }
          return accumulator;
        }, {});
        output = await handle.apply(this, [args[0], resolvedInputs, output]);
      }

      return output;
    };
  }
}

@Factory<ModelActionHook>(ModelActionHook)
export class ModelActionHookFactory {
  static async create(): Promise<ModelActionHook> {
    return ModelActionHook.getInstance();
  }
}
