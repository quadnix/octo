import { IModel } from '../model.interface';
import { Server } from '../server/server.model';
import { Diff } from '../utility/diff/diff.utility.model';
import { IPipeline } from './pipeline.interface';

export class Pipeline implements IModel<IPipeline, Pipeline> {
  readonly context: Server;

  readonly handlerName: string;

  readonly handlerPathInSource: string;

  readonly permissionSet: [];

  readonly pipelineName: string;

  constructor(context: Server, pipelineName: string, handlerName: string, handlerPathInSource: string) {
    this.context = context;

    this.pipelineName = pipelineName;
    this.handlerName = handlerName;
    this.handlerPathInSource = handlerPathInSource;

    this.permissionSet = [];
  }

  clone(): Pipeline {
    return new Pipeline(this.context, this.pipelineName, this.handlerName, this.handlerPathInSource);
  }

  diff(): Diff[] {
    return [];
  }

  getContext(): string {
    return [`pipeline=${this.pipelineName}`, this.context.getContext()].join(',');
  }

  synth(): IPipeline {
    return {
      handlerName: this.handlerName,
      handlerPathInSource: this.handlerPathInSource,
      permissionSet: this.permissionSet,
      pipelineName: this.pipelineName,
    };
  }
}
