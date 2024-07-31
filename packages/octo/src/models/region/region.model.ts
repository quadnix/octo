import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import type { Diff } from '../../functions/diff/diff.js';
import { Environment } from '../environment/environment.model.js';
import { AModel } from '../model.abstract.js';
import { Subnet } from '../subnet/subnet.model.js';
import type { IRegion } from './region.interface.js';

/**
 * A Region model is a physical geographical area where the app can be deployed.
 * Typically, for redundancy and low latency, an app is deployed in multiple regions.
 * Therefore, it's common to have multiple region nodes under the app.
 *
 * @example
 * ```ts
 * const region = new Region('us-east-1');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model()
export class Region extends AModel<IRegion, Region> {
  readonly MODEL_NAME: string = 'region';

  readonly regionId: string;

  constructor(regionId: string) {
    super();

    this.regionId = regionId;
  }

  /**
   * To add an {@link Environment}.
   */
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

  /**
   * To add a {@link Subnet}.
   */
  addSubnet(subnet: Subnet): void {
    const childrenDependencies = this.getChildren('subnet');
    if (!childrenDependencies['subnet']) childrenDependencies['subnet'] = [];

    // Check for duplicates.
    const subnets = childrenDependencies['subnet'].map((d) => d.to);
    if (subnets.find((z: Subnet) => z.subnetId === subnet.subnetId)) {
      throw new Error('Subnet already exists!');
    }
    this.addChild('regionId', subnet, 'subnetId');
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.regionId}`, app.getContext()].join(',');
  }

  override synth(): IRegion {
    return {
      regionId: this.regionId,
    };
  }

  static override async unSynth(
    region: IRegion,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Region> {
    return new Region(region.regionId);
  }
}
