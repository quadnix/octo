import { PostModelActionCallback, PostModelActionHandleHook } from '../functions/hook/post-model-action-handle.hook.js';
import { PreCommitCallback, PreCommitHandleHook } from '../functions/hook/pre-commit-handle.hook.js';

export function Module({
  postModelActionHandles = [],
  preCommitHandles = [],
}: {
  postModelActionHandles?: { ACTION_NAME: string; callback: PostModelActionCallback }[];
  preCommitHandles?: { callback: PreCommitCallback }[];
}): (constructor: any) => void {
  return function () {
    for (const { ACTION_NAME, callback } of postModelActionHandles) {
      PostModelActionHandleHook.register(ACTION_NAME, callback);
    }

    for (const { callback } of preCommitHandles) {
      PreCommitHandleHook.register(callback);
    }
  };
}
