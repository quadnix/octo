import { Constructable } from '../app.type.js';
import { AHook } from '../functions/hook/hook.abstract.js';

export function EnableHook(hook: {
  new (): AHook;
  registrar: (constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor) => void;
}): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    hook.registrar(target.constructor, propertyKey, descriptor);
  };
}
