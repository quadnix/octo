import { Schema } from '../functions/schema/schema.js';
import type { IResourceReference } from './resource.interface.js';

/**
 * @group Resources
 */
export class BaseResourceSchema {
  parents = Schema<IResourceReference[]>();

  properties = Schema<{ [key: string]: unknown }>();

  resourceId = Schema<string>();

  response = Schema<{ [key: string]: unknown }>();

  tags = Schema<{ [key: string]: string }>();
}
