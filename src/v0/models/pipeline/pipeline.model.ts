import { DiffUtility } from '../../functions/diff/diff.utility';
import { App } from '../app/app.model';
import { IModel } from '../model.interface';
import { Diff } from '../../functions/diff/diff.model';
import { IPipeline } from './pipeline.interface';

export class Pipeline implements IModel<IPipeline, Pipeline> {
  readonly context: App;

  readonly instructionSet: string[] = [];

  readonly pipelineName: string;

  constructor(context: App, pipelineName: string) {
    this.context = context;
    this.pipelineName = pipelineName;
  }

  clone(): Pipeline {
    const pipeline = new Pipeline(this.context, this.pipelineName);

    pipeline.instructionSet.push(...this.instructionSet);

    return pipeline;
  }

  diff(previous?: Pipeline): Diff[] {
    // Generate diff of instructionSet.
    return DiffUtility.diffArray(previous || ({ instructionSet: [] } as unknown as Pipeline), this, 'instructionSet');
  }

  getContext(): string {
    return [`pipeline=${this.pipelineName}`, this.context.getContext()].join(',');
  }

  synth(): IPipeline {
    return {
      instructionSet: this.instructionSet,
      pipelineName: this.pipelineName,
    };
  }
}
