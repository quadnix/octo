import { Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import type { InternetGatewaySchema } from '../internet-gateway/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { ATFResource } from '../tf-resource.abstract.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { NatGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<NatGateway>('@octo', 'nat-gateway', NatGatewaySchema)
export class NatGateway extends ATFResource<NatGatewaySchema, NatGateway> {
  declare parents: [
    MatchingResource<VpcSchema>,
    MatchingResource<InternetGatewaySchema>,
    MatchingResource<SubnetSchema>,
  ];
  declare properties: NatGatewaySchema['properties'];
  declare response: NatGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: NatGatewaySchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<InternetGatewaySchema>, MatchingResource<SubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: NatGateway): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update NAT Gateway immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const natGatewayOctoResource = octoTerraform.addOctoTerraformResource(this as NatGateway, [
      this.parents[0],
      this.parents[1],
    ]);

    const eipTFResource = natGatewayOctoResource.addTerraformResource('aws_eip', `${this.resourceId}_eip`, {
      domain: 'vpc',
    });

    const natGatewayTFResource = natGatewayOctoResource.addTerraformResource('aws_nat_gateway', this.resourceId, {
      allocation_id: octoTerraform.raw(`${eipTFResource.address}.id`),
      connectivity_type: this.properties.ConnectivityType,
      subnet_id: octoTerraform.getRef(this.parents[2], 'SubnetId'),
    });
    natGatewayOctoResource.output({
      AllocationId: octoTerraform.raw(`${eipTFResource.address}.id`),
      NatGatewayId: octoTerraform.raw(`${natGatewayTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      eipTFResource.attribute('tags', this.tags);
      natGatewayTFResource.attribute('tags', this.tags);
    }
  }
}
