import { Constructable } from '../app.type.js';
import { PostModelActionCallback, PostModelActionHandleHook } from '../functions/hook/post-model-action-handle.hook.js';
import { PreCommitCallback, PreCommitHandleHook } from '../functions/hook/pre-commit-handle.hook.js';
import { Container } from './container.js';

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
      Container.get(PostModelActionHandleHook)
        .then((aHook) => {
          aHook.register(constructor.name, { imports, postModelActionHandles });
        })
        .catch((error) => {
          console.error(error);
        });
    }

    if (preCommitHandles.length > 0) {
      Container.get(PreCommitHandleHook)
        .then((aHook) => {
          aHook.register(constructor.name, { imports, preCommitHandles });
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };
}
