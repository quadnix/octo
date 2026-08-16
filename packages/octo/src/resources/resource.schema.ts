import { Schema } from '../functions/schema/schema.js';
import type { IResourceReference } from './resource.interface.js';

/**
 * The schema every resource schema extends.
 *
 * A resource schema narrows `properties` and `response` to the fields that resource actually has;
 * the remaining members are the same for all resources.
 *
 * @example
 * ```ts
 * export class MyResourceSchema extends BaseResourceSchema {
 *   override properties = Schema<{ bucketName: string }>();
 *   override response = Schema<{ arn: string }>();
 * }
 * ```
 *
 * @group Resources
 */
export class BaseResourceSchema {
  /**
   * The resources this one is built on top of.
   */
  parents = Schema<IResourceReference[]>();

  /**
   * The desired configuration of the resource, i.e. what you asked the cloud provider for.
   */
  properties = Schema<{ [key: string]: unknown }>();

  /**
   * The ID of the resource, unique across the infrastructure.
   */
  resourceId = Schema<string>();

  /**
   * What the cloud provider reported back once the resource existed. Empty until then.
   */
  response = Schema<{ [key: string]: string }>();

  /**
   * The tags applied to the resource.
   */
  tags = Schema<{ [key: string]: string }>();
}
