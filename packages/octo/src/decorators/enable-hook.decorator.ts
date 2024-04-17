import { AHook } from '../functions/hook/hook.abstract.js';
import { Container } from './container.js';

type Hook = 'PostModelActionHandleHook' | 'PreCommitHandleHook';

export function EnableHook(hook: Hook): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Container.get<AHook>(hook)
      .then((aHook) => {
        aHook.registrar(target.constructor, propertyKey, descriptor);
      })
      .catch((error) => {
        console.error(error);
      });
  };
}
