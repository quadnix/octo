import type { Constructable } from '../../app.type.js';
import { SchemaError } from '../../errors/index.js';

export function getSchemaInstance<S>(
  schemaClass: Constructable<S>,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const instance: Record<string, unknown> = {};

  for (const key of getSchemaKeys<S>(schemaClass)) {
    if (!value.hasOwnProperty(key)) {
      throw new SchemaError(`Property "${key}" from schema is missing from inputs!`, schemaClass.name);
    }

    instance[key] = value[key];
  }

  return instance;
}

export function getSchemaKeys<S>(schemaClass: Constructable<S>): string[] {
  const t = new schemaClass();
  const keys: string[] = [];

  for (const key in t) {
    keys.push(key);
  }

  return keys;
}

export function Schema<T>(): T {
  return undefined as T;
}
