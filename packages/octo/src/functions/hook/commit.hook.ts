import {
  CommitHookCallbackDoneEvent,
  PostCommitHookCallbackDoneEvent,
  PreCommitHookCallbackDoneEvent,
} from '../../events/index.js';
import type { Octo } from '../../main.js';
import type { App } from '../../models/app/app.model.js';
import type { ModuleContainer } from '../../modules/module.container.js';
import { EventService } from '../../services/event/event.service.js';
import type { DiffMetadata } from '../diff/diff-metadata.js';
import type { IHook } from './hook.interface.js';

export class CommitHook implements IHook {
  private static instance: CommitHook;

  private readonly postCommitHooks: Octo['commitTransaction'][] = [];
  private readonly preCommitHooks: Octo['commitTransaction'][] = [];

  collectHooks(registeredModules: ModuleContainer['modules']): void {
    for (const m of registeredModules) {
      for (const { callback } of m.properties.postCommitHooks || []) {
        this.postCommitHooks.push(callback);
      }

      for (const { callback } of m.properties.preCommitHooks || []) {
        this.preCommitHooks.push(callback);
      }
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

    descriptor.value = async function (...args: [App, DiffMetadata[][], DiffMetadata[][]]): Promise<void> {
      for (const callback of self.preCommitHooks) {
        await callback.apply(this, args);
        EventService.getInstance().emit(new PreCommitHookCallbackDoneEvent());
      }

      await originalMethod.apply(this, args);
      EventService.getInstance().emit(new CommitHookCallbackDoneEvent());

      for (const callback of self.postCommitHooks) {
        await callback.apply(this, args);
        EventService.getInstance().emit(new PostCommitHookCallbackDoneEvent());
      }
    };
  }

  reset(): void {
    this.postCommitHooks.splice(0, this.postCommitHooks.length);
    this.preCommitHooks.splice(0, this.preCommitHooks.length);
  }
}
