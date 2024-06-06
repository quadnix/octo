import type { Constructable } from '../app.type.js';
import { type PostModelActionCallback, PostModelActionHook } from '../functions/hook/post-model-action.hook.js';
import { type PreCommitCallback, PreCommitHook } from '../functions/hook/pre-commit.hook.js';
import { type PreModelActionCallback, PreModelActionHook } from '../functions/hook/pre-model-action.hook.js';
import type { IModelAction } from '../models/model-action.interface.js';

export function Module({
  imports = [],
  postModelActionHandles = [],
  preModelActionHandles = [],
  preCommitHandles = [],
}: {
  imports?: Constructable<unknown>[];
  postModelActionHandles?: {
    ACTION_NAME: string;
    callback: PostModelActionCallback;
    collectInput?: IModelAction['collectInput'];
  }[];
  preModelActionHandles?: {
    ACTION_NAME: string;
    callback: PreModelActionCallback;
    collectInput?: IModelAction['collectInput'];
  }[];
  preCommitHandles?: { callback: PreCommitCallback }[];
}): (constructor: any) => void {
  return function (constructor: any) {
    if (postModelActionHandles.length > 0) {
      PostModelActionHook.getInstance().register(constructor.name, { imports, postModelActionHandles });
    }

    if (preModelActionHandles.length > 0) {
      PreModelActionHook.getInstance().register(constructor.name, { imports, preModelActionHandles });
    }

    if (preCommitHandles.length > 0) {
      PreCommitHook.getInstance().register(constructor.name, { imports, preCommitHandles });
    }
  };
}
