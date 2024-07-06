import { CommitHook } from '../functions/hook/commit.hook.js';

type Hook = 'CommitHook';

export function EnableHook(hook: Hook): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    switch (hook) {
      case 'CommitHook':
        CommitHook.getInstance().registrar(descriptor);
        break;
      default:
        throw new Error('Invalid hook!');
    }
  };
}
