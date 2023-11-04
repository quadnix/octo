import { Model } from '../../decorators/model.decorator.js';
import { DiffUtility } from '../../functions/diff/diff.utility.js';
import { AModel } from '../model.abstract.js';
import { Diff } from '../../functions/diff/diff.model.js';
import { IPipeline } from './pipeline.interface.js';

@Model()
export class Pipeline extends AModel<IPipeline, Pipeline> {
  readonly MODEL_NAME: string = 'pipeline';

  readonly instructionSet: string[] = [];

  readonly pipelineName: string;

  constructor(pipelineName: string) {
    super();
    this.pipelineName = pipelineName;
  }

  override async diff(previous?: Pipeline): Promise<Diff[]> {
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

  static override async unSynth(pipeline: IPipeline): Promise<Pipeline> {
    const newPipeline = new Pipeline(pipeline.pipelineName);
    newPipeline.instructionSet.push(...pipeline.instructionSet);
    return newPipeline;
  }
}
