import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { DiffAction } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import type { Region } from '../region/region.model.js';
import { SubnetSchema, SubnetType } from './subnet.schema.js';

/**
 * A Subnet model is the logical sub-division of the region, e.g. a public and a private subnet.
 * A subnet is often used to isolate parts of your infrastructure with access gates in the front.
 * - A subnet can only belong to one region, but a region can have multiple subnets.
 *
 * @example
 * ```ts
 * const subnet = new Subnet(region, 'my-subnet');
 * subnet.subnetType = SubnetType.PUBLIC;
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AModel<SubnetSchema, Subnet> {
  private options: SubnetSchema['options'] = {
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

  override setContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${(this.constructor as typeof Subnet).NODE_NAME}=${this.subnetId}`, region.getContext()].join(',');
  }

  override synth(): SubnetSchema {
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
    subnet: SubnetSchema,
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
      thisToThatDependency.addBehavior('sibling', DiffAction.ADD, 'subnetId', DiffAction.ADD);
      thisToThatDependency.addBehavior('sibling', DiffAction.ADD, 'subnetId', DiffAction.UPDATE);
      thatToThisDependency.addBehavior('sibling', DiffAction.ADD, 'subnetId', DiffAction.ADD);
      thatToThisDependency.addBehavior('sibling', DiffAction.ADD, 'subnetId', DiffAction.UPDATE);
    } else if (!allowConnections && subnets.find((s: Subnet) => s.subnetId === subnet.subnetId)) {
      this.removeRelationship(subnet);
    }
  }
}
