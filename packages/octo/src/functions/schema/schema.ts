import type { Constructable } from '../../app.type.js';
import { SchemaError } from '../../errors/index.js';

export function getSchemaInstance<S extends object>(schemaClass: Constructable<S>, value: S): Record<string, unknown> {
  const instance: Record<string, unknown> = {};
  const t = new schemaClass();

  for (const key of getSchemaKeys<S>(schemaClass)) {
    if (value.hasOwnProperty(key) && value[key] !== undefined) {
      t[key] = value[key];
      instance[key] = t[key];
    } else {
      instance[key] = t[key];
    }

    if (instance[key] === undefined) {
      throw new SchemaError(`Property "${key}" in schema could not be resolved!`, schemaClass.name);
    }
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
