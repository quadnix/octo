import {
  PostResourceActionHookCallbackDoneEvent,
  PreResourceActionHookCallbackDoneEvent,
  ResourceActionHookCallbackDoneEvent,
} from '../../events/index.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import type { EventService } from '../../services/event/event.service.js';
import type { IHook } from './hook.interface.js';

type PostHookSignature = {
  action: IResourceAction;
  handle: IResourceAction['handle'];
};
type PreHookSignature = {
  action: IResourceAction;
  handle: IResourceAction['handle'];
};

export class ResourceActionHook implements IHook<PreHookSignature, PostHookSignature> {
  private static instance: ResourceActionHook;

  private readonly postResourceActionHooks: {
    [key: string]: Omit<PostHookSignature, 'action'>[];
  } = {};
  private readonly preResourceActionHooks: {
    [key: string]: Omit<PostHookSignature, 'action'>[];
  } = {};

  private constructor(private readonly eventService: EventService) {}

  collectHooks(hooks: { postHooks?: PostHookSignature[]; preHooks?: PreHookSignature[] }): void {
    for (const { action, handle } of hooks.postHooks || []) {
      if (!this.postResourceActionHooks[action.constructor.name]) {
        this.postResourceActionHooks[action.constructor.name] = [];
      }
      this.postResourceActionHooks[action.constructor.name].push({ handle });
    }

    for (const { action, handle } of hooks.preHooks || []) {
      if (!this.preResourceActionHooks[action.constructor.name]) {
        this.preResourceActionHooks[action.constructor.name] = [];
      }
      this.preResourceActionHooks[action.constructor.name].push({ handle });
    }
  }

  static getInstance(eventService: EventService): ResourceActionHook {
    if (!this.instance) {
      this.instance = new ResourceActionHook(eventService);
    }
    return this.instance;
  }

  registrar(resourceAction: IResourceAction): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalHandleMethod = resourceAction.handle;

    resourceAction.handle = async function (...args: Parameters<IResourceAction['handle']>): Promise<void> {
      for (const { handle } of self.preResourceActionHooks[resourceAction.constructor.name] || []) {
        await handle.apply(this, args);
        self.eventService.emit(new PreResourceActionHookCallbackDoneEvent());
      }

      await originalHandleMethod.apply(this, args);
      self.eventService.emit(new ResourceActionHookCallbackDoneEvent());

      for (const { handle } of self.postResourceActionHooks[resourceAction.constructor.name] || []) {
        await handle.apply(this, args);
        self.eventService.emit(new PostResourceActionHookCallbackDoneEvent());
      }
    };
  }

  reset(): void {
    for (const name in this.postResourceActionHooks) {
      delete this.postResourceActionHooks[name];
    }
    for (const name in this.preResourceActionHooks) {
      delete this.preResourceActionHooks[name];
    }
  }
}
