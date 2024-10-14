import type { ActionOutputs } from '../../app.type.js';
import { InputNotFoundTransactionError } from '../../errors/index.js';
import { Container } from '../container/container.js';
import {
  ModelActionHookCallbackDoneEvent,
  PostModelActionHookCallbackDoneEvent,
  PreModelActionHookCallbackDoneEvent,
} from '../../events/index.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import { EventService } from '../../services/event/event.service.js';
import { InputService } from '../../services/input/input.service.js';
import type { IHook } from './hook.interface.js';

type PostHookSignature = {
  action: IModelAction;
  collectInput?: IModelAction['collectInput'];
  handle: IModelAction['handle'];
};
type PreHookSignature = {
  action: IModelAction;
  collectInput?: IModelAction['collectInput'];
  handle: IModelAction['handle'];
};

export class ModelActionHook implements IHook<PreHookSignature, PostHookSignature> {
  private static instance: ModelActionHook;

  private readonly postModelActionHooks: {
    [key: string]: Omit<PostHookSignature, 'action'>[];
  } = {};
  private readonly preModelActionHooks: {
    [key: string]: Omit<PreHookSignature, 'action'>[];
  } = {};

  private constructor() {}

  collectHooks(hooks: { postHooks?: PostHookSignature[]; preHooks?: PreHookSignature[] }): void {
    for (const { action, collectInput, handle } of hooks.postHooks || []) {
      if (!this.postModelActionHooks[action.constructor.name]) {
        this.postModelActionHooks[action.constructor.name] = [];
      }
      this.postModelActionHooks[action.constructor.name].push({ collectInput, handle });
    }

    for (const { action, collectInput, handle } of hooks.preHooks || []) {
      if (!this.preModelActionHooks[action.constructor.name]) {
        this.preModelActionHooks[action.constructor.name] = [];
      }
      this.preModelActionHooks[action.constructor.name].push({ collectInput, handle });
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

    modelAction.handle = async function (...args: Parameters<IModelAction['handle']>): Promise<ActionOutputs> {
      const inputService = await Container.getInstance().get(InputService);

      let output = args[2] || {};

      for (const { collectInput, handle } of self.preModelActionHooks[modelAction.constructor.name] || []) {
        const inputs = collectInput ? collectInput(args[0]) : [];
        const resolvedInputs = inputs.reduce((accumulator, currentValue) => {
          accumulator[currentValue] = inputService.getInput(currentValue);
          if (!accumulator[currentValue]) {
            throw new InputNotFoundTransactionError(
              'No matching input found to process hook!',
              { action: modelAction.constructor.name } as unknown as IModelAction,
              args[0],
              currentValue,
            );
          }
          return accumulator;
        }, {});
        output = await handle.apply(this, [args[0], resolvedInputs, output]);
        EventService.getInstance().emit(new PreModelActionHookCallbackDoneEvent());
      }

      output = await originalHandleMethod.apply(this, [args[0], args[1], output]);
      EventService.getInstance().emit(new ModelActionHookCallbackDoneEvent());

      for (const { collectInput, handle } of self.postModelActionHooks[modelAction.constructor.name] || []) {
        const inputs = collectInput ? collectInput(args[0]) : [];
        const resolvedInputs = inputs.reduce((accumulator, currentValue) => {
          accumulator[currentValue] = inputService.getInput(currentValue);
          if (!accumulator[currentValue]) {
            throw new InputNotFoundTransactionError(
              'No matching input found to process hook!',
              { action: modelAction.constructor.name } as unknown as IModelAction,
              args[0],
              currentValue,
            );
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
