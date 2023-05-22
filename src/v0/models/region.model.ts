import { Environment } from './environment.model';

export type IRegionId = 'aws-us-east-1' | 'aws-ap-south-1';

export class Region {
  environments: Environment[] = [];

  regionId: IRegionId;

  constructor(regionId: IRegionId) {
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
