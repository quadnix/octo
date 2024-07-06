import { Factory } from '../../decorators/factory.decorator.js';
import { IResourceAction } from '../../resources/resource-action.interface.js';
import { Diff } from '../diff/diff.js';
import { AHook } from './hook.abstract.js';

export class ResourceActionHook extends AHook {
  private static instance: ResourceActionHook;

  private readonly postResourceActionHooks: {
    [key: string]: { handle: IResourceAction['handle'] }[];
  } = {};
  private readonly preResourceActionHooks: {
    [key: string]: { handle: IResourceAction['handle'] }[];
  } = {};

  override collectHooks(): void {
    for (const m of this.registeredModules) {
      for (const { ACTION_NAME, handle } of m.moduleProperties.postResourceActionHooks || []) {
        if (!this.postResourceActionHooks[ACTION_NAME]) {
          this.postResourceActionHooks[ACTION_NAME] = [];
        }
        this.postResourceActionHooks[ACTION_NAME].push({ handle });
      }

      for (const { ACTION_NAME, handle } of m.moduleProperties.preResourceActionHooks || []) {
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

  override registrar(resourceAction: IResourceAction): void {
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
}

@Factory<ResourceActionHook>(ResourceActionHook)
export class ResourceActionHookFactory {
  static async create(): Promise<ResourceActionHook> {
    return ResourceActionHook.getInstance();
  }
}
