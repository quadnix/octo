import { DiffUtility } from '../../functions/diff/diff.utility';
import { Diff } from '../../functions/diff/diff.model';
import { Model } from '../model.abstract';
import { IEnvironment } from './environment.interface';

export class Environment extends Model<IEnvironment, Environment> {
  readonly MODEL_NAME: string = 'environment';

  readonly environmentName: string;

  readonly environmentVariables: Map<string, string> = new Map();

  constructor(environmentName: string) {
    super();
    this.environmentName = environmentName;
  }

  clone(): Environment {
    const environment = new Environment(this.environmentName);

    for (const [key, value] of this.environmentVariables) {
      environment.environmentVariables.set(key, value);
    }

    return environment;
  }

  override diff(previous?: Environment): Diff[] {
    // Generate diff of environmentVariables.
    return DiffUtility.diffMap(
      previous || ({ environmentVariables: new Map() } as Environment),
      this,
      'environmentVariables',
    );
  }

  getContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${this.MODEL_NAME}=${this.environmentName}`, region.getContext()].join(',');
  }

  synth(): IEnvironment {
    return {
      environmentName: this.environmentName,
      environmentVariables: Object.fromEntries(this.environmentVariables || new Map()),
    };
  }
}
