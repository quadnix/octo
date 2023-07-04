import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { DiffUtility } from '../../functions/diff/diff.utility';
import { IEnvironment } from '../environment/environment.interface';
import { Environment } from '../environment/environment.model';
import { Model } from '../model.abstract';
import { IRegion } from './region.interface';

export class Region extends Model<IRegion, Region> {
  readonly MODEL_NAME: string = 'region';

  readonly environments: Environment[] = [];

  readonly regionId: string;

  constructor(regionId: string) {
    super();
    this.regionId = regionId;
  }

  addEnvironment(environment: Environment): void {
    // Check for duplicates.
    if (this.environments.find((e) => e.environmentName === environment.environmentName)) {
      throw new Error('Environment already exists!');
    }

    // Define parent-child dependency.
    environment.addDependency('environmentName', DiffAction.ADD, this, 'regionId', DiffAction.ADD);
    environment.addDependency('environmentName', DiffAction.ADD, this, 'regionId', DiffAction.UPDATE);
    this.addDependency('regionId', DiffAction.DELETE, environment, 'environmentName', DiffAction.DELETE);

    this.environments.push(environment);
  }

  clone(): Region {
    const region = new Region(this.regionId);

    this.environments.forEach((environment) => {
      region.addEnvironment(environment.clone());
    });

    return region;
  }

  diff(previous?: Region): Diff[] {
    // Generate diff of environments.
    return DiffUtility.diffModels(previous?.environments || [], this.environments, 'environmentName');
  }

  isEqual(instance: Region): boolean {
    return this.regionId === instance.regionId;
  }

  synth(): IRegion {
    const environments: IEnvironment[] = [];
    this.environments.forEach((environment) => {
      environments.push(environment.synth());
    });

    return {
      environments,
      regionId: this.regionId,
    };
  }
}
