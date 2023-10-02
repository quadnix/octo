import { Environment } from '../environment/environment.model';
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
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.regionId}`, app.getContext()].join(',');
  }

  synth(): IRegion {
    return {
      regionId: this.regionId,
    };
  }

  static async unSynth(region: IRegion): Promise<Region> {
    return new Region(region.regionId);
  }
}
