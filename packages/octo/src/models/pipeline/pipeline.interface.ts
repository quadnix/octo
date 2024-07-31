import type { Pipeline } from './pipeline.model.js';

/**
 * {@link Pipeline} model interface.
 *
 * @group Model Interfaces
 */
export interface IPipeline {
  instructionSet: Pipeline['instructionSet'];
  pipelineName: Pipeline['pipelineName'];
}
