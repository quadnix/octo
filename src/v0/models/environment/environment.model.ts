import { Diff, DiffAction } from '../../utility/diff.utility';
import { Execution } from '../execution/execution.model';
import { IModel } from '../model.interface';
import { Region } from '../region/region.model';

export class Environment implements IModel<Environment> {
  readonly context: Region;

  readonly environmentName: string;

  readonly environmentVariables: Map<string, string> = new Map();

  readonly executions: Execution[] = [];

  constructor(context: Region, environmentName: string) {
    this.context = context;
    this.environmentName = environmentName;
  }

  addExecution(execution: Execution): void {
    // Check for duplicates.
    if (this.executions.find((e) => e.executionId === execution.executionId)) {
      throw new Error('Execution already exists!');
    }

    this.executions.push(execution);
  }

  clone(): Environment {
    const environment = new Environment(this.context, this.environmentName);

    for (const [key, value] of this.environmentVariables) {
      environment.environmentVariables.set(key, value);
    }

    return environment;
  }

  diff(previous?: Environment): Diff[] {
    const diff: Diff[] = [];

    for (const [key, value] of previous?.environmentVariables || new Map()) {
      if (this.environmentVariables.has(key)) {
        if (this.environmentVariables.get(key) !== value) {
          diff.push(
            new Diff(DiffAction.UPDATE, this.getContext(), 'environmentVariables', {
              key,
              value: this.environmentVariables.get(key),
            }),
          );
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previous!.getContext(), 'environmentVariables', { key, value }));
      }
    }

    for (const [key, value] of this.environmentVariables) {
      if (!previous?.environmentVariables.has(key)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'environmentVariables', { key, value }));
      }
    }

    return diff;
  }

  getContext(): string {
    return [`environment=${this.environmentName}`, this.context.getContext()].join(',');
  }
}
