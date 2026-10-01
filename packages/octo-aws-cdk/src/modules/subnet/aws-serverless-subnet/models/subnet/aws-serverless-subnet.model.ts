import { Model, type Region, Subnet } from '@quadnix/octo';
import { AwsServerlessSubnetSchema } from './aws-serverless-subnet.schema.js';

/**
 * @internal
 */
@Model<AwsServerlessSubnet>('@octo', 'subnet', AwsServerlessSubnetSchema)
export class AwsServerlessSubnet extends Subnet {
  /**
   * @internal
   */
  static override async unSynth(
    subnet: AwsServerlessSubnetSchema,
    deReferenceContext: (context: string) => Promise<Region>,
  ): Promise<AwsServerlessSubnet> {
    const region = (await deReferenceContext(subnet.region.context)) as Region;
    return new AwsServerlessSubnet(region, subnet.subnetName);
  }
}
