import type { ActionInputs, ActionOutputs } from '../../app.type.js';
import { Container } from '../container/container.js';
import {
  ModelActionHookCallbackDoneEvent,
  PostModelActionHookCallbackDoneEvent,
  PreModelActionHookCallbackDoneEvent,
} from '../../events/index.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import type { ModuleContainer } from '../../modules/module.container.js';
import { EventService } from '../../services/event/event.service.js';
import { InputService } from '../../services/input/input.service.js';
import type { Diff } from '../diff/diff.js';
import type { IHook } from './hook.interface.js';

export class ModelActionHook implements IHook {
  private static instance: ModelActionHook;

  private readonly postModelActionHooks: {
    [key: string]: { collectInput?: IModelAction['collectInput']; handle: IModelAction['handle'] }[];
  } = {};
  private readonly preModelActionHooks: {
    [key: string]: { collectInput?: IModelAction['collectInput']; handle: IModelAction['handle'] }[];
  } = {};

  collectHooks(registeredModules: ModuleContainer['modules']): void {
    for (const m of registeredModules) {
      for (const { ACTION_NAME, collectInput, handle } of m.properties.postModelActionHooks || []) {
        if (!this.postModelActionHooks[ACTION_NAME]) {
          this.postModelActionHooks[ACTION_NAME] = [];
        }
        this.postModelActionHooks[ACTION_NAME].push({ collectInput, handle });
      }

      for (const { ACTION_NAME, collectInput, handle } of m.properties.preModelActionHooks || []) {
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

  registrar(modelAction: IModelAction): void {
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
        EventService.getInstance().emit(new PreModelActionHookCallbackDoneEvent());
      }

      output = await originalHandleMethod.apply(this, [args[0], args[1], output]);
      EventService.getInstance().emit(new ModelActionHookCallbackDoneEvent());

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
        EventService.getInstance().emit(new PostModelActionHookCallbackDoneEvent());
      }

      return output;
    };
  }

  reset(): void {
    for (const name in this.postModelActionHooks) {
      delete this.postModelActionHooks[name];
    }
    for (const name in this.preModelActionHooks) {
      delete this.preModelActionHooks[name];
    }
  }
}
