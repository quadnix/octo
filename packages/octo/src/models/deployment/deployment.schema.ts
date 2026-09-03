import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Deployment} model.
 *
 * @group Models/Deployment
 */
export class DeploymentSchema {
  /**
   * The identifying tag that can point to the server's code at a specific point in time.
   * Could be a version number or a commit hash.
   *
   * 2 to 32 characters of letters, numbers, hyphens, and underscores, starting and ending with a
   * letter or a number. A dot is not one of them, so a version reads as `0-0-1` rather than
   * `0.0.1`.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w-]*[a-zA-Z0-9]$/ } })
  deploymentTag = Schema<string>();
}
