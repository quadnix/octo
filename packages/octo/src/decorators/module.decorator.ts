import { Constructable } from '../app.type.js';
import { PostModelActionCallback, PostModelActionHook } from '../functions/hook/post-model-action.hook.js';
import { PreCommitCallback, PreCommitHook } from '../functions/hook/pre-commit.hook.js';

export function Module({
  imports = [],
  postModelActionHandles = [],
  preCommitHandles = [],
}: {
  imports?: Constructable<unknown>[];
  postModelActionHandles?: { ACTION_NAME: string; callback: PostModelActionCallback }[];
  preCommitHandles?: { callback: PreCommitCallback }[];
}): (constructor: any) => void {
  return function (constructor: any) {
    if (postModelActionHandles.length > 0) {
      PostModelActionHook.getInstance().register(constructor.name, { imports, postModelActionHandles });
    }

    if (preCommitHandles.length > 0) {
      PreCommitHook.getInstance().register(constructor.name, { imports, preCommitHandles });
    }
  };
}
