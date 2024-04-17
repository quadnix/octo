import { Constructable } from '../app.type.js';
import { PostModelActionCallback, PostModelActionHook } from '../functions/hook/post-model-action.hook.js';
import { PreCommitCallback, PreCommitHook } from '../functions/hook/pre-commit.hook.js';
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
      Container.get(PostModelActionHook)
        .then((aHook) => {
          aHook.register(constructor.name, { imports, postModelActionHandles });
        })
        .catch((error) => {
          console.error(error);
        });
    }

    if (preCommitHandles.length > 0) {
      Container.get(PreCommitHook)
        .then((aHook) => {
          aHook.register(constructor.name, { imports, preCommitHandles });
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };
}
