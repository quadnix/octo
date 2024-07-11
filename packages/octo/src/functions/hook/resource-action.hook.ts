import type { ModuleContainer } from '../../modules/module.container.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import type { Diff } from '../diff/diff.js';
import type { IHook } from './hook.interface.js';

export class ResourceActionHook implements IHook {
  private static instance: ResourceActionHook;

  private readonly postResourceActionHooks: {
    [key: string]: { handle: IResourceAction['handle'] }[];
  } = {};
  private readonly preResourceActionHooks: {
    [key: string]: { handle: IResourceAction['handle'] }[];
  } = {};

  collectHooks(registeredModules: ModuleContainer['modules']): void {
    for (const m of registeredModules) {
      for (const { ACTION_NAME, handle } of m.properties.postResourceActionHooks || []) {
        if (!this.postResourceActionHooks[ACTION_NAME]) {
          this.postResourceActionHooks[ACTION_NAME] = [];
        }
        this.postResourceActionHooks[ACTION_NAME].push({ handle });
      }

      for (const { ACTION_NAME, handle } of m.properties.preResourceActionHooks || []) {
        if (!this.preResourceActionHooks[ACTION_NAME]) {
          this.preResourceActionHooks[ACTION_NAME] = [];
        }
        this.preResourceActionHooks[ACTION_NAME].push({ handle });
      }
    }
  }

  static getInstance(): ResourceActionHook {
    if (!this.instance) {
      this.instance = new ResourceActionHook();
    }
    return this.instance;
  }

  registrar(resourceAction: IResourceAction): void {
    // `self` here references this class, vs `this` references the original method.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalHandleMethod = resourceAction.handle;

    resourceAction.handle = async function (...args: [Diff]): Promise<void> {
      for (const { handle } of self.preResourceActionHooks[resourceAction.ACTION_NAME] || []) {
        await handle.apply(this, args);
      }

      await originalHandleMethod.apply(this, args);

      for (const { handle } of self.postResourceActionHooks[resourceAction.ACTION_NAME] || []) {
        await handle.apply(this, args);
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
