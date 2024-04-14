import { Constructable } from '../../app.type.js';

export abstract class AHook {
  static registrar(...args: [Constructable<unknown>, string, PropertyDescriptor]): void {
    if (args.length > 3) {
      throw new Error('Too many args in createInstance()');
    }
    throw new Error('Method not implemented! Use subclass');
  }
}
