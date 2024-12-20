import { Model, Region, Subnet } from '@quadnix/octo';
import { AwsSubnetSchema } from './aws.subnet.schema.js';

@Model<AwsSubnet>('@octo', 'subnet', AwsSubnetSchema)
export class AwsSubnet extends Subnet {
  static override async unSynth(
    awsSubnet: AwsSubnetSchema,
    deReferenceContext: (context: string) => Promise<Region>,
  ): Promise<AwsSubnet> {
    const region = (await deReferenceContext(awsSubnet.region.context)) as Region;
    const newSubnet = new AwsSubnet(region, awsSubnet.subnetName);

    newSubnet.disableSubnetIntraNetwork = awsSubnet.options.disableSubnetIntraNetwork;
    newSubnet.subnetType = awsSubnet.options.subnetType;

    return newSubnet;
  }
}
