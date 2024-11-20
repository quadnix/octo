import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

export class EnvironmentSchema {
  /**
   * The name of the environment.
   * An environment must be unique within a Region. But multiple Regions can share the same environment name.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  environmentName = Schema<string>();

  /**
   * A set of environment variables to be passed to any {@link Execution} running in this environment.
   */
  @Validate({
    destruct: (value: { [key: string]: string }): string[] => {
      return Object.keys(value);
    },
    options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ },
  })
  environmentVariables = Schema<{ [key: string]: string }>();
}
