import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import type { ISubnet } from './subnet.interface.js';

/**
 * The type of subnet.
 */
export enum SubnetType {
  /**
   * A public subnet is open to the internet,
   * i.e. an {@link Execution} within this subnet can be accessed from the internet.
   * Other than access from the internet, any other access needs to be explicitly allowed.
   */
  PUBLIC = 'public',

  /**
   * A private subnet has limited access to anything outside of this subnet, including access from the internet.
   * Access to this subnet needs to be explicitly allowed.
   */
  PRIVATE = 'private',
}

/**
 * A Subnet model is the logical sub-division of the region, e.g. a public and a private subnet.
 * A subnet is often used to isolate parts of your infrastructure with access gates in the front.
 * - A subnet can only belong to one region, but a region can have multiple subnets.
 *
 * @example
 * ```ts
 * const subnet = new Subnet(region, SubnetType.PRIVATE);
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model()
export class Subnet extends AModel<ISubnet, Subnet> {
  readonly MODEL_NAME: string = 'subnet';

  private options: { disableSubnetIntraNetwork: boolean; subnetType: SubnetType } = {
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  };

  /**
   * The ID of the subnet.
   * - Format is `{regionId}-{subnetName}`
   */
  readonly subnetId: string;

  /**
   * The name of the subnet.
   */
  readonly subnetName: string;

  constructor(region: Region, name: string) {
    super();

    this.subnetId = region.regionId + '-' + name;
    this.subnetName = name;
  }

  /**
   * To block/disable intra-network communication within self.
   * When this is set to `true`,
   * any execution within this subnet will not be able to communicate with other executions within the same subnet.
   *
   * @defaultValue `false`
   * @experimental
   */
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

  /**
   * To update the networking rules of this subnet to allow or deny connectivity from another subnet.
   * The networking rules are bi-directional,
   * i.e. if subnet A can connect to subnet B, then subnet B can also connect to subnet A.
   *
   * @param subnet The other subnet.
   * @param allowConnections Set to `true` to allow this and the other subnet to connect.
   * Set to `false` to block this and the other subnet from connecting.
   */
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
