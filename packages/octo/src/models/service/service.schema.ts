import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Service} model.
 * Subclasses extend this schema to declare whatever the third-party service needs.
 *
 * @group Models/Service
 */
export class ServiceSchema {
  /**
   * The ID of the service, unique within the {@link App}.
   */
  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  serviceId = Schema<string>();
}
