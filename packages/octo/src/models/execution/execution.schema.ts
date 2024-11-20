import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';
import { IModelReference } from '../model.interface.js';

export class ExecutionSchema {
  deployment = Schema<IModelReference>();

  environment = Schema<IModelReference>();

  /**
   * A set of environment variables to be passed to the Docker container.
   * It represents setting the [--env](https://docs.docker.com/compose/environment-variables/set-environment-variables/)
   * option while running a Docker container.
   */
  @Validate({
    destruct: (value: { [key: string]: string }): string[] => {
      return Object.keys(value);
    },
    options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ },
  })
  environmentVariables = Schema<{ [key: string]: string }>();

  subnet = Schema<IModelReference>();
}
