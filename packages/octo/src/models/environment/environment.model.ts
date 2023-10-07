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

  override async diff(previous?: Environment): Promise<Diff[]> {
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

  static override async unSynth(environment: IEnvironment): Promise<Environment> {
    const newEnvironment = new Environment(environment.environmentName);

    for (const key in environment.environmentVariables) {
      newEnvironment.environmentVariables.set(key, environment.environmentVariables[key]);
    }

    return newEnvironment;
  }
}
