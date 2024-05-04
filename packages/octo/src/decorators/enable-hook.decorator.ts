import { PostModelActionHook } from '../functions/hook/post-model-action.hook.js';
import { PreCommitHook } from '../functions/hook/pre-commit.hook.js';
import { PreModelActionHook } from '../functions/hook/pre-model-action.hook.js';

type Hook = 'PostModelActionHook' | 'PreModelActionHook' | 'PreCommitHook';

export function EnableHook(hook: Hook): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    switch (hook) {
      case 'PostModelActionHook':
        PostModelActionHook.getInstance().registrar(target.constructor, propertyKey, descriptor);
        break;
      case 'PreModelActionHook':
        PreModelActionHook.getInstance().registrar(target.constructor, propertyKey, descriptor);
        break;
      case 'PreCommitHook':
        PreCommitHook.getInstance().registrar(target.constructor, propertyKey, descriptor);
        break;
      default:
        throw new Error('Invalid hook!');
    }
  };
}
