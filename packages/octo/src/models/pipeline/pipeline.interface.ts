import { Pipeline } from './pipeline.model.js';

export interface IPipeline {
  instructionSet: Pipeline['instructionSet'];
  pipelineName: Pipeline['pipelineName'];
}
