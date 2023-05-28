import { Diff, DiffAction } from '../../utility/diff.utility';
import { App } from '../app/app.model';
import { Environment } from '../environment/environment.model';
import { IModel } from '../model.interface';
import { AwsRegionId } from './aws/region.model';

export type RegionId = AwsRegionId;

export class Region implements IModel<Region> {
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
    const diff: Diff[] = [];

    for (const previousEnvironment of previous?.environments || []) {
      const environment = this.environments.find((e) => e.environmentName === previousEnvironment.environmentName);
      if (environment) {
        const environmentDiff = environment.diff(previousEnvironment);
        if (environmentDiff.length !== 0) {
          diff.push(...environmentDiff);
        }
      } else {
        diff.push(
          new Diff(DiffAction.DELETE, previous!.getContext(), 'environment', previousEnvironment.environmentName),
        );
      }
    }

    for (const environment of this.environments) {
      if (!previous?.environments.find((e) => e.environmentName === environment.environmentName)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'environment', environment.environmentName));

        const environmentDiff = environment.diff();
        if (environmentDiff.length !== 0) {
          diff.push(...environmentDiff);
        }
      }
    }

    return diff;
  }

  getContext(): string {
    return [`region=${this.regionId}`, this.context.getContext()].join(',');
  }
}
