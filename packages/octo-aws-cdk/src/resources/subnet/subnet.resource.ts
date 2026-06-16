import {
  ATerraformResource,
  Diff,
  DiffUtility,
  MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SubnetSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends ATerraformResource<SubnetSchema, Subnet> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(resourceId: string, properties: SubnetSchema['properties'], parents: [MatchingResource<VpcSchema>]) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: Subnet): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update Subnet immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const subnetOctoResource = terraform.addOctoTerraformResource(this as Subnet, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const subnetTFResource = subnetOctoResource.addTerraformResource('aws_subnet', this.resourceId, {
      availability_zone: this.properties.AvailabilityZone,
      cidr_block: this.properties.CidrBlock,
      vpc_id: terraform.getRef(this.parents[0], 'VpcId'),
    });
    subnetOctoResource.output({
      SubnetArn: terraform.raw(`${subnetTFResource.address}.arn`),
      SubnetId: terraform.raw(`${subnetTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      subnetTFResource.attribute('tags', this.tags);
    }
  }
}
