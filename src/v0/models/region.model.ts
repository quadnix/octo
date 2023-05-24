import { IAwsRegionId } from './aws/region.model';
import { Environment } from './environment.model';

export type IRegionId = IAwsRegionId;

export class Region {
  readonly environments: Environment[] = [];

  readonly regionId: IRegionId;

  protected constructor(regionId: IRegionId) {
    this.regionId = regionId;
  }

  addEnvironment(environment: Environment): void {
    // Check for duplicates.
    if (
      this.environments.find(
        (e) => e.environmentName === environment.environmentName,
      )
    ) {
      throw new Error('Environment already exists!');
    }

    this.environments.push(environment);
  }
}
