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

  override diff(previous?: Pipeline): Diff[] {
    // Generate diff of instructionSet.
    return DiffUtility.diffArray(previous || ({ instructionSet: [] } as unknown as Pipeline), this, 'instructionSet');
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.pipelineName}`, app.getContext()].join(',');
  }

  synth(): IPipeline {
    return {
      instructionSet: [...this.instructionSet],
      pipelineName: this.pipelineName,
    };
  }

  static async unSynth(pipeline: IPipeline): Promise<Pipeline> {
    const newPipeline = new Pipeline(pipeline.pipelineName);
    newPipeline.instructionSet.push(...pipeline.instructionSet);
    return newPipeline;
  }
}