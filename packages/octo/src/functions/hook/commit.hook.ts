import {
  CommitHookCallbackDoneEvent,
  PostCommitHookCallbackDoneEvent,
  PreCommitHookCallbackDoneEvent,
} from '../../events/index.js';
import type { Octo } from '../../main.js';
import { EventService } from '../../services/event/event.service.js';
import type { IHook } from './hook.interface.js';

type PostHookSignature = { handle: Octo['commitTransaction'] };
type PreHookSignature = { handle: Octo['commitTransaction'] };

export class CommitHook implements IHook<PreHookSignature, PostHookSignature> {
  private static instance: CommitHook;

  private readonly postCommitHooks: PostHookSignature[] = [];
  private readonly preCommitHooks: PreHookSignature[] = [];

  private constructor() {}

  collectHooks(hooks: { postHooks?: PostHookSignature[]; preHooks?: PreHookSignature[] }): void {
    for (const { handle } of hooks.postHooks || []) {
      this.postCommitHooks.push({ handle });
    }

    for (const { handle } of hooks.preHooks || []) {
      this.preCommitHooks.push({ handle });
    }
  }

  static getInstance(): CommitHook {
    if (!this.instance) {
      this.instance = new CommitHook();
    }
    return this.instance;
  }

  registrar(descriptor: PropertyDescriptor): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: Parameters<Octo['commitTransaction']>): Promise<void> {
      for (const { handle } of self.preCommitHooks) {
        await handle.apply(this, args);
        EventService.getInstance().emit(new PreCommitHookCallbackDoneEvent());
      }

      await originalMethod.apply(this, args);
      EventService.getInstance().emit(new CommitHookCallbackDoneEvent());

      for (const { handle } of self.postCommitHooks) {
        await handle.apply(this, args);
        EventService.getInstance().emit(new PostCommitHookCallbackDoneEvent());
      }
    };
  }

  reset(): void {
    this.postCommitHooks.splice(0, this.postCommitHooks.length);
    this.preCommitHooks.splice(0, this.preCommitHooks.length);
  }
}
