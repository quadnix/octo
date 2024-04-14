import { Constructable } from '../app.type.js';
import { AHook } from '../functions/hook/hook.abstract.js';

export function EnableHook<T>(hook: {
  new (): AHook;
  registrar: (constructor: Constructable<unknown>, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) => void;
}): (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) => void {
  return function (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) {
    hook.registrar(target.constructor, propertyKey, descriptor);
  };
}
