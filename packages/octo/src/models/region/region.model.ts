import { Model } from '../../decorators/model.decorator.js';
import { Environment } from '../environment/environment.model.js';
import { AModel } from '../model.abstract.js';
import { IRegion } from './region.interface.js';

@Model()
export class Region extends AModel<IRegion, Region> {
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

  static override async unSynth(region: IRegion): Promise<Region> {
    return new Region(region.regionId);
  }
}
