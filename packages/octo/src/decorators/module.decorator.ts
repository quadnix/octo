import type { Constructable } from '../app.type.js';
import { CommitHook, type PostCommitCallback, type PreCommitCallback } from '../functions/hook/commit.hook.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import type { IModelAction } from '../models/model-action.interface.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';

export function Module({
  imports = [],
  postCommitHooks = [],
  postModelActionHooks = [],
  postResourceActionHooks = [],
  preCommitHooks = [],
  preModelActionHooks = [],
  preResourceActionHooks = [],
}: {
  imports?: Constructable<unknown>[];
  postCommitHooks?: { callback: PostCommitCallback }[];
  postModelActionHooks?: {
    ACTION_NAME: string;
    collectInput?: IModelAction['collectInput'];
    handle: IModelAction['handle'];
  }[];
  postResourceActionHooks?: {
    ACTION_NAME: string;
    handle: IResourceAction['handle'];
  }[];
  preCommitHooks?: { callback: PreCommitCallback }[];
  preModelActionHooks?: {
    ACTION_NAME: string;
    collectInput?: IModelAction['collectInput'];
    handle: IModelAction['handle'];
  }[];
  preResourceActionHooks?: {
    ACTION_NAME: string;
    handle: IResourceAction['handle'];
  }[];
}): (constructor: any) => void {
  return function (constructor: any) {
    CommitHook.getInstance().registerModule(constructor.name, { imports, postCommitHooks, preCommitHooks });

    ModelActionHook.getInstance().registerModule(constructor.name, {
      imports,
      postModelActionHooks,
      preModelActionHooks,
    });

    ResourceActionHook.getInstance().registerModule(constructor.name, {
      imports,
      postResourceActionHooks,
      preResourceActionHooks,
    });
  };
}
