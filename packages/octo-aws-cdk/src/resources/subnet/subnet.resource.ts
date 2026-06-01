import { Diff, DiffUtility, MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SubnetSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends ATFResource<SubnetSchema, Subnet> {
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

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const subnetOctoResource = octoTerraform.addOctoTerraformResource(this as Subnet);

    const subnetTFResource = subnetOctoResource.addTerraformResource('aws_subnet', this.resourceId, {
      availability_zone: this.properties.AvailabilityZone,
      cidr_block: this.properties.CidrBlock,
      vpc_id: octoTerraform.getRef(this.parents[0], 'VpcId'),
    });
    subnetOctoResource.output({
      SubnetArn: octoTerraform.raw(`${subnetTFResource.address}.arn`),
      SubnetId: octoTerraform.raw(`${subnetTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      subnetTFResource.attribute('tags', this.tags);
    }
  }
}
