import { Factory } from '../../decorators/factory.decorator.js';
import { App } from '../../models/app/app.model.js';
import { DiffMetadata } from '../diff/diff-metadata.js';
import { AHook } from './hook.abstract.js';

export type PostCommitCallback = (...args: [App, DiffMetadata[][]]) => Promise<void>;
export type PreCommitCallback = (...args: [App, DiffMetadata[][]]) => Promise<void>;

export class CommitHook extends AHook {
  private static instance: CommitHook;

  private readonly postCommitHooks: PostCommitCallback[] = [];
  private readonly preCommitHooks: PreCommitCallback[] = [];

  override collectHooks(): void {
    for (const m of this.registeredModules) {
      for (const { callback } of m.moduleProperties.postCommitHooks || []) {
        this.postCommitHooks.push(callback);
      }

      for (const { callback } of m.moduleProperties.preCommitHooks || []) {
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

  override registrar(descriptor: PropertyDescriptor): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: [App, DiffMetadata[][]]): Promise<void> {
      for (const callback of self.preCommitHooks) {
        await callback.apply(this, args);
      }

      await originalMethod.apply(this, args);

      for (const callback of self.postCommitHooks) {
        await callback.apply(this, args);
      }
    };
  }
}

@Factory<CommitHook>(CommitHook)
export class CommitHookFactory {
  static async create(): Promise<CommitHook> {
    return CommitHook.getInstance();
  }
}
