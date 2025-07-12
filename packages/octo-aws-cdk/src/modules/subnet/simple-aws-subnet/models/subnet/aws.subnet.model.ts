import { Model, Region, Subnet } from '@quadnix/octo';
import { AwsSubnetSchema } from './aws.subnet.schema.js';

/**
 * @internal
 */
@Model<AwsSubnet>('@octo', 'subnet', AwsSubnetSchema)
export class AwsSubnet extends Subnet {
  private optionsExtension: AwsSubnetSchema['optionsExtension'] = {
    createNatGateway: false,
  };

  get createNatGateway(): boolean {
    return this.optionsExtension.createNatGateway;
  }

  set createNatGateway(createNatGateway: boolean) {
    this.optionsExtension.createNatGateway = createNatGateway;
  }

  static override async unSynth(
    awsSubnet: AwsSubnetSchema,
    deReferenceContext: (context: string) => Promise<Region>,
  ): Promise<AwsSubnet> {
    const region = (await deReferenceContext(awsSubnet.region.context)) as Region;
    const newSubnet = new AwsSubnet(region, awsSubnet.subnetName);

    newSubnet.createNatGateway = awsSubnet.optionsExtension.createNatGateway;
    newSubnet.disableSubnetIntraNetwork = awsSubnet.options.disableSubnetIntraNetwork;
    newSubnet.subnetType = awsSubnet.options.subnetType;

    return newSubnet;
  }
}
