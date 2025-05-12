import type { IUnknownResourceAction } from '../../app.type.js';
import { PostResourceActionHookCallbackDoneEvent, PreResourceActionHookCallbackDoneEvent } from '../../events/index.js';
import { EventService } from '../../services/event/event.service.js';
import { Container } from '../container/container.js';
import type { IHook } from './hook.interface.js';

type PostHookSignature = {
  action: IUnknownResourceAction;
  handle: IUnknownResourceAction['handle'];
};
type PreHookSignature = {
  action: IUnknownResourceAction;
  handle: IUnknownResourceAction['handle'];
};

export class ResourceActionHook implements IHook<PreHookSignature, PostHookSignature> {
  private static instance: ResourceActionHook;

  private readonly postResourceActionHooks: {
    [key: string]: Omit<PostHookSignature, 'action'>[];
  } = {};
  private readonly preResourceActionHooks: {
    [key: string]: Omit<PostHookSignature, 'action'>[];
  } = {};

  private constructor() {}

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

  static getInstance(): ResourceActionHook {
    if (!this.instance) {
      this.instance = new ResourceActionHook();
    }
    return this.instance;
  }

  registrar(resourceAction: IUnknownResourceAction): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalHandleMethod = resourceAction.handle;

    resourceAction.handle = async function (...args: Parameters<IUnknownResourceAction['handle']>): Promise<void> {
      const container = Container.getInstance();
      const eventService = await container.get(EventService);

      for (const { handle } of self.preResourceActionHooks[resourceAction.constructor.name] || []) {
        await handle.apply(this, args);
        eventService.emit(new PreResourceActionHookCallbackDoneEvent(resourceAction.constructor.name));
      }

      await originalHandleMethod.apply(this, args);

      for (const { handle } of self.postResourceActionHooks[resourceAction.constructor.name] || []) {
        await handle.apply(this, args);
        eventService.emit(new PostResourceActionHookCallbackDoneEvent(resourceAction.constructor.name));
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
