import type { Constructable } from '../app.type.js';
import { Container } from './container.js';

export function Factory<T>(
  type: Constructable<T> | string,
  options?: {
    metadata?: { [key: string]: string };
  },
): (constructor: { create: (...args: unknown[]) => Promise<T> }) => void {
  return function (constructor: { create: (...args: unknown[]) => Promise<T> }) {
    Container.registerFactory<T>(type, constructor, options);
  };
}
