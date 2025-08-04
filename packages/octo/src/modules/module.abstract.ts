import { strict as assert } from 'assert';
import type { ModuleSchema, UnknownModel } from '../app.type.js';
import type { CommitHook } from '../functions/hook/commit.hook.js';
import type { ModelActionHook } from '../functions/hook/model-action.hook.js';
import type { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import type { IModule } from './module.interface.js';

export abstract class AModule<S, T extends UnknownModel> implements IModule<S, T> {
  static readonly MODULE_PACKAGE: string;

  static readonly MODULE_SCHEMA: ModuleSchema<AModule<any, any>>;

  readonly moduleId: string;

  constructor(moduleId: string) {
    this.moduleId = moduleId;
  }

  abstract onInit(inputs: S): Promise<T | UnknownModel[]>;

  registerHooks(): {
    postCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['postHooks'];
    postModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['postHooks'];
    postResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['postHooks'];
    preCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['preHooks'];
    preModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['preHooks'];
    preResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['preHooks'];
  } {
    return {};
  }

  async registerMetadata(inputs: S): Promise<Record<string, unknown>> {
    assert(!!inputs);
    return {};
  }
}
