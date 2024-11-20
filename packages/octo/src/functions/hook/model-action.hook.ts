import type { ActionOutputs, IUnknownModelAction } from '../../app.type.js';
import {
  ModelActionHookCallbackDoneEvent,
  PostModelActionHookCallbackDoneEvent,
  PreModelActionHookCallbackDoneEvent,
} from '../../events/index.js';
import type { EventService } from '../../services/event/event.service.js';
import type { IHook } from './hook.interface.js';

type PostHookSignature = {
  action: IUnknownModelAction;
  handle: IUnknownModelAction['handle'];
};
type PreHookSignature = {
  action: IUnknownModelAction;
  handle: IUnknownModelAction['handle'];
};

export class ModelActionHook implements IHook<PreHookSignature, PostHookSignature> {
  private static instance: ModelActionHook;

  private readonly postModelActionHooks: {
    [key: string]: Omit<PostHookSignature, 'action'>[];
  } = {};
  private readonly preModelActionHooks: {
    [key: string]: Omit<PreHookSignature, 'action'>[];
  } = {};

  private constructor(private readonly eventService: EventService) {}

  collectHooks(hooks: { postHooks?: PostHookSignature[]; preHooks?: PreHookSignature[] }): void {
    for (const { action, handle } of hooks.postHooks || []) {
      if (!this.postModelActionHooks[action.constructor.name]) {
        this.postModelActionHooks[action.constructor.name] = [];
      }
      this.postModelActionHooks[action.constructor.name].push({ handle });
    }

    for (const { action, handle } of hooks.preHooks || []) {
      if (!this.preModelActionHooks[action.constructor.name]) {
        this.preModelActionHooks[action.constructor.name] = [];
      }
      this.preModelActionHooks[action.constructor.name].push({ handle });
    }
  }

  static getInstance(eventService: EventService): ModelActionHook {
    if (!this.instance) {
      this.instance = new ModelActionHook(eventService);
    }
    return this.instance;
  }

  registrar(modelAction: IUnknownModelAction): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalHandleMethod = modelAction.handle;

    modelAction.handle = async function (...args: Parameters<IUnknownModelAction['handle']>): Promise<ActionOutputs> {
      let output = args[2] || {};

      for (const { handle } of self.preModelActionHooks[modelAction.constructor.name] || []) {
        output = await handle.apply(this, [args[0], args[1], output]);
        self.eventService.emit(new PreModelActionHookCallbackDoneEvent());
      }

      output = await originalHandleMethod.apply(this, [args[0], args[1], output]);
      self.eventService.emit(new ModelActionHookCallbackDoneEvent());

      for (const { handle } of self.postModelActionHooks[modelAction.constructor.name] || []) {
        output = await handle.apply(this, [args[0], args[1], output]);
        self.eventService.emit(new PostModelActionHookCallbackDoneEvent());
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
