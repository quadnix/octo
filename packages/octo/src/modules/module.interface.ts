import type { UnknownModel } from '../app.type.js';
import type { CommitHook } from '../functions/hook/commit.hook.js';
import type { ModelActionHook } from '../functions/hook/model-action.hook.js';
import type { ResourceActionHook } from '../functions/hook/resource-action.hook.js';

export interface IModule<S, T extends UnknownModel> {
  onInit(inputs: S): Promise<T | UnknownModel[]>;

  registerHooks(): {
    postCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['postHooks'];
    postModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['postHooks'];
    postResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['postHooks'];
    preCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['preHooks'];
    preModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['preHooks'];
    preResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['preHooks'];
  };

  registerMetadata(inputs: S): Promise<Record<string, unknown>>;
}
