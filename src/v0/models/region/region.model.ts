import { DiffUtility } from '../../utility/diff/diff.utility';
import { Diff } from '../utility/diff/diff.utility.model';
import { App } from '../app/app.model';
import { IEnvironment } from '../environment/environment.interface';
import { Environment } from '../environment/environment.model';
import { IModel } from '../model.interface';
import { AwsRegionId } from './aws/region.model';
import { IRegion } from './region.interface';

export type RegionId = AwsRegionId;

export class Region implements IModel<IRegion, Region> {
  readonly context: App;

  readonly environments: Environment[] = [];

  readonly regionId: RegionId;

  protected constructor(context: App, regionId: RegionId) {
    this.context = context;
    this.regionId = regionId;
  }

  addEnvironment(environment: Environment): void {
    // Check for duplicates.
    if (this.environments.find((e) => e.environmentName === environment.environmentName)) {
      throw new Error('Environment already exists!');
    }

    this.environments.push(environment);
  }

  clone(): Region {
    const region = new Region(this.context, this.regionId);

    this.environments.forEach((environment) => {
      region.addEnvironment(environment.clone());
    });

    return region;
  }

  diff(previous?: Region): Diff[] {
    // Generate diff of environments.
    return DiffUtility.diffModels(previous?.environments || [], this.environments, 'environment', 'environmentName');
  }

  getContext(): string {
    return [`region=${this.regionId}`, this.context.getContext()].join(',');
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
