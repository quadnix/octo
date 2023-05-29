import { Diff } from '../../utility/diff.utility';
import { Execution } from '../execution/execution.model';
import { IModel } from '../model.interface';

export class Instance implements IModel<Instance> {
  readonly context: Execution;

  readonly taskId: string;

  constructor(context: Execution, taskId: string) {
    this.context = context;
    this.taskId = taskId;
  }

  clone(): Instance {
    return new Instance(this.context, this.taskId);
  }

  diff(): Diff[] {
    // Diff of an instance is intentionally empty,
    // since instances can only be constructed, never diff-ed.
    // Instances are dynamically added by engine in its own state.
    return [];
  }

  getContext(): string {
    return [`instance=${this.taskId}`, this.context.getContext()].join(',');
  }
}
