import type { Constructable } from '../../app.type.js';
import { SchemaError } from '../../errors/index.js';

/**
 * @internal
 */
export function getSchemaInstance<S extends object>(schemaClass: Constructable<S>, value: S): Record<string, unknown> {
  if (value === undefined) {
    throw new SchemaError(`Cannot determine schema with "${value}" value!`, schemaClass.name);
  }

  const instance: Record<string, unknown> = {};
  const t = new schemaClass();

  for (const key of getSchemaKeys<S>(schemaClass)) {
    try {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined) {
        t[key] = value[key];
        instance[key] = t[key];
      } else {
        instance[key] = t[key];
      }
    } catch (error) {
      throw new SchemaError(`Property "${key}" in schema could not be validated!`, schemaClass.name);
    }

    if (instance[key] === undefined) {
      throw new SchemaError(`Property "${key}" in schema could not be resolved!`, schemaClass.name);
    }
  }

  return instance;
}

/**
 * @internal
 */
export function getSchemaKeys<S>(schemaClass: Constructable<S>): string[] {
  const t = new schemaClass();
  const keys: string[] = [];

  for (const key in t) {
    keys.push(key);
  }

  return keys;
}

/**
 * The Schema function is used to set type and value for a property in a schema class or on a class property.
 * It also accepts a default value.
 *
 * @group Functions/Schema
 *
 * @param defaultValue The default value for the property.
 * The default value is automatically assigned when the original value is `undefined`.
 *
 * @see Techniques for [Schema](/docs/techniques/schema).
 */
export function Schema<T>(defaultValue?: T): T {
  return (defaultValue === undefined ? undefined : (defaultValue as T)) as T;
}
