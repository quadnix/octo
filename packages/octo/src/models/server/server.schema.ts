import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Server} model.
 *
 * @group Models/Server
 */
export class ServerSchema {
  /**
   * The name of the server, unique within the {@link App}.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  serverKey = Schema<string>();
}
