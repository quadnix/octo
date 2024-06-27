import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import type { ISubnet } from './subnet.interface.js';

export enum SubnetType {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Model()
export class Subnet extends AModel<ISubnet, Subnet> {
  readonly MODEL_NAME: string = 'subnet';

  private options: { disableSubnetIntraNetwork: boolean; subnetType: SubnetType } = {
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  };

  readonly subnetId: string;

  readonly subnetName: string;

  constructor(region: Region, name: string) {
    super();

    this.subnetId = region.regionId + '-' + name;
    this.subnetName = name;
  }

  get disableSubnetIntraNetwork(): boolean {
    return this.options.disableSubnetIntraNetwork;
  }

  set disableSubnetIntraNetwork(disableSubnetIntraNetwork: boolean) {
    this.options.disableSubnetIntraNetwork = disableSubnetIntraNetwork;
  }

  get subnetType(): SubnetType {
    return this.options.subnetType;
  }

  set subnetType(subnetType: SubnetType) {
    this.options.subnetType = subnetType || SubnetType.PRIVATE;
  }

  override async diffProperties(previous: Subnet): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Generate diff of options.
    if (previous.disableSubnetIntraNetwork !== this.disableSubnetIntraNetwork) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'disableSubnetIntraNetwork', this.disableSubnetIntraNetwork));
    }
    if (previous.subnetType !== this.subnetType) {
      throw new Error('Change of subnet type is not supported!');
    }

    return diffs;
  }

  override setContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${this.MODEL_NAME}=${this.subnetId}`, region.getContext()].join(',');
  }

  override synth(): ISubnet {
    const parents = this.getParents();
    const region = parents['region'][0].to as Region;

    return {
      options: { disableSubnetIntraNetwork: this.disableSubnetIntraNetwork, subnetType: this.subnetType },
      region: { context: region.getContext() },
      subnetId: this.subnetId,
      subnetName: this.subnetName,
    };
  }

  static override async unSynth(
    subnet: ISubnet,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Subnet> {
    const region = (await deReferenceContext(subnet.region.context)) as Region;
    const newSubnet = new Subnet(region, subnet.subnetName);

    newSubnet.disableSubnetIntraNetwork = subnet.options.disableSubnetIntraNetwork;
    newSubnet.subnetType = subnet.options.subnetType;

    return newSubnet;
  }

  updateNetworkingRules(subnet: Subnet, allowConnections: boolean): void {
    const siblingDependencies = this.getSiblings('subnet');
    if (!siblingDependencies['subnet']) siblingDependencies['subnet'] = [];
    const subnets = siblingDependencies['subnet'].map((d) => d.to);

    if (allowConnections && !subnets.find((s: Subnet) => s.subnetId === subnet.subnetId)) {
      const { thisToThatDependency, thatToThisDependency } = this.addRelationship(subnet);
      thisToThatDependency.addBehavior('subnetId', DiffAction.ADD, 'subnetId', DiffAction.ADD);
      thisToThatDependency.addBehavior('subnetId', DiffAction.ADD, 'subnetId', DiffAction.UPDATE);
      thatToThisDependency.addBehavior('subnetId', DiffAction.DELETE, 'subnetId', DiffAction.DELETE);
    } else if (!allowConnections && subnets.find((s: Subnet) => s.subnetId === subnet.subnetId)) {
      this.removeRelationship(subnet);
    }
  }
}
