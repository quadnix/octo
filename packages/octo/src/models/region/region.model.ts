/* eslint-disable @typescript-eslint/no-unused-vars */

import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Environment } from '../environment/environment.model.js';
import { AModel } from '../model.abstract.js';
import { Subnet } from '../subnet/subnet.model.js';
import type { IRegion } from './region.interface.js';

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

  static override async unSynth(
    region: IRegion,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Region> {
    return new Region(region.regionId);
  }
}
