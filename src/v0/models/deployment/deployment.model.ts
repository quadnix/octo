import { Diff } from '../utility/diff/diff.utility.model';
import { IModel } from '../model.interface';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';
import { IDeployment } from './deployment.interface';

export class Deployment implements IModel<IDeployment, Deployment> {
  readonly context: Server | Support;

  readonly deploymentTag: string;

  constructor(context: Server | Support, deploymentTag: string) {
    this.context = context;
    this.deploymentTag = deploymentTag;
  }

  clone(): Deployment {
    return new Deployment(this.context, this.deploymentTag);
  }

  diff(): Diff[] {
    return [];
  }

  getContext(): string {
    return [`deployment=${this.deploymentTag}`, this.context.getContext()].join(',');
  }

  synth(): IDeployment {
    return {
      deploymentTag: this.deploymentTag,
    };
  }
}
