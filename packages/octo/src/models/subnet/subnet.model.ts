import { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { ISubnet } from './subnet.interface.js';

enum SubnetType {
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

  override async diff(previous?: Subnet): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Generate diff of options.
    if (previous && previous.disableSubnetIntraNetwork !== this.disableSubnetIntraNetwork) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'disableSubnetIntraNetwork', this.disableSubnetIntraNetwork));
    }
    if (previous && previous.subnetType !== this.subnetType) {
      throw new Error('Change of subnet type is not supported!');
    }

    // Generate diff of associations.
    const children = this.getChildren()['subnet'] ?? [];
    const previousChildren = previous?.getChildren()['subnet'] ?? [];
    for (const pd of previousChildren) {
      if (!children.find((d) => (d.to as Subnet).subnetId === (pd.to as Subnet).subnetId)) {
        diffs.push(new Diff(this, DiffAction.DELETE, 'association', pd.to));
      }
    }
    for (const d of children) {
      if (!previousChildren.find((pd) => (pd.to as Subnet).subnetId === (d.to as Subnet).subnetId)) {
        diffs.push(new Diff(this, DiffAction.ADD, 'association', d.to));
      }
    }

    return diffs;
  }

  getContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${this.MODEL_NAME}=${this.subnetId}`, region.getContext()].join(',');
  }

  synth(): ISubnet {
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
    const newSubnet = new Subnet(region, subnet.subnetId);

    newSubnet.disableSubnetIntraNetwork = subnet.options.disableSubnetIntraNetwork;
    newSubnet.subnetType = subnet.options.subnetType;

    return newSubnet;
  }

  updateNetworkingRules(subnet: Subnet, allowConnections: boolean): void {
    const childrenDependencies = this.getChildren('subnet');
    if (!childrenDependencies['subnet']) childrenDependencies['subnet'] = [];
    const subnets = childrenDependencies['subnet'].map((d) => d.to);

    if (allowConnections && !subnets.find((s: Subnet) => s.subnetId === subnet.subnetId)) {
      this.addChild('subnetId', subnet, 'subnetId');
    } else if (!allowConnections && subnets.find((s: Subnet) => s.subnetId === subnet.subnetId)) {
      this.removeRelationship(subnet);
    }
  }
}
