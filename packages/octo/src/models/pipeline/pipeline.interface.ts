import { Pipeline } from './pipeline.model';

export interface IPipeline {
  instructionSet: Pipeline['instructionSet'];
  pipelineName: Pipeline['pipelineName'];
}
