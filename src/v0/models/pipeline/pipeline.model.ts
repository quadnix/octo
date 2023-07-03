import { DiffUtility } from '../../functions/diff/diff.utility';
import { Model } from '../model.abstract';
import { Diff } from '../../functions/diff/diff.model';
import { IPipeline } from './pipeline.interface';

export class Pipeline extends Model<IPipeline, Pipeline> {
  readonly MODEL_NAME: string = 'pipeline';

  readonly instructionSet: string[] = [];

  readonly pipelineName: string;

  constructor(pipelineName: string) {
    super();
    this.pipelineName = pipelineName;
  }

  clone(): Pipeline {
    const pipeline = new Pipeline(this.pipelineName);

    pipeline.instructionSet.push(...this.instructionSet);

    return pipeline;
  }

  diff(previous?: Pipeline): Diff[] {
    // Generate diff of instructionSet.
    return DiffUtility.diffArray(previous || ({ instructionSet: [] } as unknown as Pipeline), this, 'instructionSet');
  }

  synth(): IPipeline {
    return {
      instructionSet: this.instructionSet,
      pipelineName: this.pipelineName,
    };
  }
}
