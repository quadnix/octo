import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Pipeline} model.
 *
 * @group Models/Pipeline
 */
export class PipelineSchema {
  /**
   * The ordered steps the pipeline runs.
   */
  instructionSet = Schema<string[]>();

  /**
   * The name of the pipeline, unique within the {@link App}.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  pipelineName = Schema<string>();
}
