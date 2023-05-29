import { Diff } from '../../utility/diff.utility';
import { IExecution } from '../execution/execution.interface';
import { Execution } from '../execution/execution.model';
import { IModel } from '../model.interface';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';
import { IDeployment } from './deployment.interface';

export class Deployment implements IModel<IDeployment, Deployment> {
  readonly context: Server | Support;

  readonly deploymentTag: string;

  readonly executions: Execution[] = [];

  constructor(context: Server | Support, deploymentTag: string) {
    this.context = context;
    this.deploymentTag = deploymentTag;
  }

  addExecution(execution: Execution): void {
    // Check for duplicates.
    if (this.executions.find((e) => e.executionId === execution.executionId)) {
      throw new Error('Execution already exists!');
    }

    this.executions.push(execution);
  }

  clone(): Deployment {
    return new Deployment(this.context, this.deploymentTag);
  }

  diff(previous?: Deployment): Diff[] {
    return [];
  }

  getContext(): string {
    return [`deployment=${this.deploymentTag}`, this.context.getContext()].join(',');
  }

  synth(): IDeployment {
    const executions: IExecution[] = [];
    this.executions.forEach((execution) => {
      executions.push(execution.synth());
    });

    return {
      deploymentTag: this.deploymentTag,
      executions,
    };
  }
}
