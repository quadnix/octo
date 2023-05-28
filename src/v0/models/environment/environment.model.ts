import { Diff, DiffAction } from '../../utility/diff.utility';
import { IModel } from '../model.interface';
import { Region } from '../region/region.model';

export class Environment implements IModel<Environment> {
  readonly context: Region;

  readonly environmentName: string;

  readonly environmentVariables: Map<string, string> = new Map();

  constructor(context: Region, environmentName: string) {
    this.context = context;
    this.environmentName = environmentName;
  }

  clone(): Environment {
    const environment = new Environment(this.context, this.environmentName);

    for (const [key, value] of this.environmentVariables) {
      environment.environmentVariables.set(key, value);
    }

    return environment;
  }

  diff(latest: Environment): Diff[] {
    const diff: Diff[] = [];

    for (const [key, value] of this.environmentVariables) {
      if (!latest.environmentVariables.has(key)) {
        diff.push(new Diff(DiffAction.DELETE, this.getContext(), 'environmentVariables', { key, value }));
      } else if (latest.environmentVariables.get(key) !== value) {
        diff.push(
          new Diff(DiffAction.UPDATE, this.getContext(), 'environmentVariables', {
            key,
            value: latest.environmentVariables.get(key),
          }),
        );
      }
    }

    for (const [key, value] of latest.environmentVariables) {
      if (!this.environmentVariables.has(key)) {
        diff.push(
          new Diff(DiffAction.ADD, this.getContext(), 'environmentVariables', {
            key,
            value,
          }),
        );
      }
    }

    return diff;
  }

  /**
   * Generate a diff adding all children of self.
   */
  diffAdd(): Diff[] {
    const diff: Diff[] = [];

    for (const [key, value] of this.environmentVariables) {
      diff.push(
        new Diff(DiffAction.ADD, this.getContext(), 'environmentVariables', {
          key,
          value,
        }),
      );
    }

    return diff;
  }

  getContext(): string {
    return [`environment=${this.environmentName}`, this.context.getContext()].join(',');
  }
}
