import { Diff } from '../../utility/diff.utility';
import { IModel } from '../model.interface';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';

export class Deployment implements IModel<Deployment> {
  readonly context: Server | Support;

  readonly deploymentTag: string;

  constructor(context: Server | Support, deploymentTag: string) {
    this.context = context;
    this.deploymentTag = deploymentTag;
  }

  clone(): Deployment {
    return new Deployment(this.context, this.deploymentTag);
  }

  diff(latest: Deployment): Diff[] {
    return [];
  }

  /**
   * Generate a diff adding all children of self.
   */
  diffAdd(): Diff[] {
    return [];
  }

  getContext(): string {
    return [`deployment=${this.deploymentTag}`, this.context.getContext()].join(',');
  }
}
