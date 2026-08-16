import { Model, Region, Subnet } from '@quadnix/octo';
import { AwsSimpleSubnetSchema } from './aws-simple-subnet.schema.js';

/**
 * @internal
 */
@Model<AwsSimpleSubnet>('@octo', 'subnet', AwsSimpleSubnetSchema)
export class AwsSimpleSubnet extends Subnet {
  /**
   * @internal
   */
  get createNatGateway(): boolean {
    return this.optionsExtension.createNatGateway;
  }

  /**
   * @internal
   */
  set createNatGateway(createNatGateway: boolean) {
    this.optionsExtension.createNatGateway = createNatGateway;
  }

  private optionsExtension: AwsSimpleSubnetSchema['optionsExtension'] = {
    createNatGateway: false,
  };

  /**
   * @internal
   */
  static override async unSynth(
    subnet: AwsSimpleSubnetSchema,
    deReferenceContext: (context: string) => Promise<Region>,
  ): Promise<AwsSimpleSubnet> {
    const region = (await deReferenceContext(subnet.region.context)) as Region;
    const newSubnet = new AwsSimpleSubnet(region, subnet.subnetName);

    newSubnet.createNatGateway = subnet.optionsExtension.createNatGateway;
    newSubnet.disableSubnetIntraNetwork = subnet.options.disableSubnetIntraNetwork;
    newSubnet.subnetType = subnet.options.subnetType;

    return newSubnet;
  }
}
