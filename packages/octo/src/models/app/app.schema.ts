import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link App} model.
 *
 * @group Models/App
 */
export class AppSchema {
  /**
   * The name of the app. It is the root of every other node's context, so renaming it re-creates
   * the entire infrastructure.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  name = Schema<string>();
}
