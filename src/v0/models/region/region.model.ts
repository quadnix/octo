import { Diff, DiffAction } from '../../utility/diff.utility';
import { AwsRegionId } from './aws/region.model';
import { Environment } from '../environment/environment.model';
import { IModel } from '../model.interface';

export type RegionId = AwsRegionId;

export class Region implements IModel<Region> {
  readonly environments: Environment[] = [];

  readonly regionId: RegionId;

  protected constructor(regionId: RegionId) {
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

  clone(): Region {
    const region = new Region(this.regionId);

    this.environments.forEach((environment) => {
      region.addEnvironment(environment.clone());
    });

    return region;
  }

  diff(latest: Region): Diff[] {
    const diff: Diff[] = [];

    for (const environment of this.environments) {
      const environmentInLatest = latest.environments.find(
        (e) => e.environmentName === environment.environmentName,
      );
      if (!environmentInLatest) {
        diff.push(
          new Diff(
            DiffAction.DELETE,
            'environment',
            environment.environmentName,
          ),
        );
      } else {
        const environmentDiff = environment.diff(environmentInLatest);
        if (environmentDiff.length !== 0) {
          diff.push(...environmentDiff);
        }
      }
    }

    for (const environment of latest.environments) {
      if (
        !this.environments.find(
          (e) => e.environmentName === environment.environmentName,
        )
      ) {
        diff.push(
          new Diff(DiffAction.ADD, 'environment', environment.environmentName),
        );
      }
    }

    return diff;
  }
}
