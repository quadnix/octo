import type { Constructable } from '../../app.type.js';
import { SchemaError } from '../../errors/index.js';

export function getSchemaInstance<S>(
  schemaClass: Constructable<S>,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const instance: Record<string, unknown> = {};
  const t = new schemaClass();

  for (const key of getSchemaKeys<S>(schemaClass)) {
    if (!value.hasOwnProperty(key)) {
      throw new SchemaError(`Property "${key}" from schema is missing from inputs!`, schemaClass.name);
    }

    t[key] = value[key];
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

export function Schema<T>(defaultValue?: T): T {
  return (defaultValue === undefined ? undefined : (defaultValue as T)) as T;
}
