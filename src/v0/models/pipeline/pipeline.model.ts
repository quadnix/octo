import { App } from '../app/app.model';
import { IModel } from '../model.interface';
import { Diff } from '../../functions/diff/diff.model';
import { IPipeline } from './pipeline.interface';

export class Pipeline implements IModel<IPipeline, Pipeline> {
  readonly context: App;

  readonly pipelineName: string;

  constructor(context: App, pipelineName: string) {
    this.context = context;
    this.pipelineName = pipelineName;
  }

  clone(): Pipeline {
    return new Pipeline(this.context, this.pipelineName);
  }

  diff(): Diff[] {
    return [];
  }

  getContext(): string {
    return [`pipeline=${this.pipelineName}`, this.context.getContext()].join(',');
  }

  synth(): IPipeline {
    return {
      pipelineName: this.pipelineName,
    };
  }
}
