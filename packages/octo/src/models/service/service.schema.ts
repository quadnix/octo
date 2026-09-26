import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';
import type { IModelReference } from '../model.interface.js';

/**
 * What kind of thing a {@link Service} is.
 *
 * @group Models/Service
 */
export enum ServiceType {
  /**
   * A cache, such as Redis.
   */
  CACHE = 'cache',

  /**
   * A database, such as a DynamoDB table.
   */
  DATABASE = 'database',

  /**
   * Where traffic comes in, such as a load balancer or an API gateway.
   */
  LOAD_BALANCER = 'load-balancer',

  /**
   * Anything the other types do not describe.
   */
  OTHER = 'other',

  /**
   * Storage for files or objects, such as an S3 bucket.
   */
  STORAGE = 'storage',
}

/**
 * Schema of the {@link Service} model.
 * Subclasses extend this schema to declare whatever the service needs.
 *
 * @group Models/Service
 */
export class ServiceSchema {
  /**
   * What the service actually is, in free text, e.g. `dynamodb`.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  label = Schema<string>();

  /**
   * The models this service is attached under.
   */
  parents = Schema<IModelReference[]>();

  /**
   * The ID of the service, unique among the services of each of its parents.
   */
  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  serviceId = Schema<string>();

  /**
   * What kind of thing the service is. See {@link ServiceType}.
   */
  @Validate({ options: { custom: (value: ServiceType): boolean => Object.values(ServiceType).includes(value) } })
  type = Schema<ServiceType>();
}
