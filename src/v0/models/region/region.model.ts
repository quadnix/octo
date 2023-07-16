import { IEnvironment } from '../environment/environment.interface';
import { Environment } from '../environment/environment.model';
import { HOOK_NAMES } from '../hook.interface';
import { Model } from '../model.abstract';
import { IRegion } from './region.interface';

export class Region extends Model<IRegion, Region> {
  readonly MODEL_NAME: string = 'region';

  readonly regionId: string;

  constructor(regionId: string) {
    super();
    this.regionId = regionId;
  }

  addEnvironment(environment: Environment): void {
    const childrenDependencies = this.getChildren('environment');
    if (!childrenDependencies['environment']) childrenDependencies['environment'] = [];

    // Check for duplicates.
    const environments = childrenDependencies['environment'].map((d) => d.to);
    if (environments.find((e: Environment) => e.environmentName === environment.environmentName)) {
      throw new Error('Environment already exists!');
    }
    this.addChild('regionId', environment, 'environmentName');

    this.hookService.applyHooks(HOOK_NAMES.ADD_ENVIRONMENT);
  }

  clone(): Region {
    const region = new Region(this.regionId);
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['environment']) childrenDependencies['environment'] = [];

    childrenDependencies['environment'].forEach((dependency) => {
      region.addEnvironment((dependency.to as Environment).clone());
    });

    return region;
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.regionId}`, app.getContext()].join(',');
  }

  synth(): IRegion {
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['environment']) childrenDependencies['environment'] = [];

    const environments: IEnvironment[] = [];
    childrenDependencies['environment'].forEach((dependency) => {
      environments.push((dependency.to as Environment).synth());
    });

    return {
      environments,
      regionId: this.regionId,
    };
  }
}
