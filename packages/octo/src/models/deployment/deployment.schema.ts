import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

export class DeploymentSchema {
  /**
   * The identifying tag that can point to the server's code at a specific point in time.
   * Could be a version number or a commit hash.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  deploymentTag = Schema<string>();
}
