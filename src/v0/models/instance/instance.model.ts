import { Diff } from '../../functions/diff/diff.model';
import { Model } from '../model.abstract';
import { IInstance } from './instance.interface';

export class Instance extends Model<IInstance, Instance> {
  readonly MODEL_NAME: string = 'instance';

  readonly taskId: string;

  constructor(taskId: string) {
    super();
    this.taskId = taskId;
  }

  clone(): Instance {
    return new Instance(this.taskId);
  }

  diff(): Diff[] {
    // Diff of an instance is intentionally empty,
    // since instances can only be constructed, never diff-ed.
    // Instances are dynamically added by engine in its own state.
    return [];
  }

  synth(): IInstance {
    return {
      taskId: this.taskId,
    };
  }
}
