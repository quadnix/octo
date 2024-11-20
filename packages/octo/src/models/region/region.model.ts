import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { Environment } from '../environment/environment.model.js';
import type { Filesystem } from '../filesystem/filesystem.model.js';
import { AModel } from '../model.abstract.js';
import { Subnet } from '../subnet/subnet.model.js';
import { RegionSchema } from './region.schema.js';

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
@Model<Region>('@octo', 'region', RegionSchema)
export class Region extends AModel<RegionSchema, Region> {
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
      throw new ModelError('Environment already exists!', this);
    }
    this.addChild('regionId', environment, 'environmentName');
  }

  addFilesystem(filesystem: Filesystem): void {
    const childrenDependencies = this.getChildren('filesystem');
    if (!childrenDependencies['filesystem']) childrenDependencies['filesystem'] = [];

    // Check for duplicates.
    const filesystems = childrenDependencies['filesystem'].map((d) => d.to);
    if (filesystems.find((f: Filesystem) => f.filesystemName === filesystem.filesystemName)) {
      throw new ModelError('Filesystem already exists!', this);
    }
    this.addChild('regionId', filesystem, 'filesystemName');
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
      throw new ModelError('Subnet already exists!', this);
    }
    this.addChild('regionId', subnet, 'subnetId');
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Region).NODE_NAME}=${this.regionId}`, app.getContext()].join(',');
  }

  override synth(): RegionSchema {
    return {
      regionId: this.regionId,
    };
  }

  static override async unSynth(
    region: RegionSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Region> {
    assert(!!deReferenceContext);

    return new Region(region.regionId);
  }
}
