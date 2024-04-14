import { PostModelActionCallback, PostModelActionHandleHook } from '../functions/hook/post-model-action-handle.hook.js';
import { PreCommitCallback, PreCommitHandleHook } from '../functions/hook/pre-commit-handle.hook.js';
import { AModule } from '../functions/module/module.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from './container.js';

export function Module({
  postModelActionHandles = [],
  preCommitHandles = [],
}: {
  postModelActionHandles?: { ACTION_NAME: string; callback: PostModelActionCallback }[];
  preCommitHandles?: { callback: PreCommitCallback }[];
}): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ModelSerializationService).then((modelSerializationService) => {
      Container.get<AModule>(constructor.name).then((module) => {
        modelSerializationService.registerModule(module);
      });
    });

    for (const { ACTION_NAME, callback } of postModelActionHandles) {
      PostModelActionHandleHook.register(ACTION_NAME, callback);
    }

    for (const { callback } of preCommitHandles) {
      PreCommitHandleHook.register(callback);
    }
  };
}
