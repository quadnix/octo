import { Constructable } from '../app.type.js';
import { Container } from './container.js';

export function Factory<T>(
  type: Constructable<T> | string,
  metadata?: { [key: string]: string },
): (constructor: { create: () => Promise<T> }) => void {
  return function (constructor: { create: () => Promise<T> }) {
    Container.registerFactory<T>(type, constructor, metadata || {});
  };
}
