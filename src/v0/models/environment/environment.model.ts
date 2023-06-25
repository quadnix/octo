import { DiffUtility } from '../../functions/diff/diff.utility';
import { Diff } from '../../functions/diff/diff.model';
import { IModel } from '../model.interface';
import { Region } from '../region/region.model';
import { IEnvironment } from './environment.interface';

export class Environment implements IModel<IEnvironment, Environment> {
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

  diff(previous?: Environment): Diff[] {
    // Generate diff of environmentVariables.
    return DiffUtility.diffMap(
      previous || ({ environmentVariables: new Map() } as Environment),
      this,
      'environmentVariables',
    );
  }

  getContext(): string {
    return [`environment=${this.environmentName}`, this.context.getContext()].join(',');
  }

  synth(): IEnvironment {
    return {
      environmentName: this.environmentName,
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
    };
  }
}
