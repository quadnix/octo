import { Diff, DiffAction } from '../../utility/diff.utility';
import { IModel } from '../model.interface';

export class Environment implements IModel<Environment> {
  readonly environmentName: string;

  readonly environmentVariables: Map<string, string> = new Map();

  constructor(environmentName: string) {
    this.environmentName = environmentName;
  }

  clone(): Environment {
    const environment = new Environment(this.environmentName);

    for (const [key, value] of this.environmentVariables) {
      environment.environmentVariables.set(key, value);
    }

    return environment;
  }

  diff(latest: Environment): Diff[] {
    const diff: Diff[] = [];

    for (const [key, value] of this.environmentVariables) {
      if (!latest.environmentVariables.has(key)) {
        diff.push(
          new Diff(DiffAction.DELETE, 'environmentVariables', { key, value }),
        );
      } else if (latest.environmentVariables.get(key) !== value) {
        diff.push(
          new Diff(DiffAction.UPDATE, 'environmentVariables', {
            key,
            value: latest.environmentVariables.get(key),
          }),
        );
      }
    }

    for (const [key, value] of latest.environmentVariables) {
      if (!this.environmentVariables.has(key)) {
        diff.push(
          new Diff(DiffAction.ADD, 'environmentVariables', { key, value }),
        );
      }
    }

    return diff;
  }
}
