import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { InternetGatewaySchema } from '../internet-gateway/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { NatGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<NatGateway>('@octo', 'nat-gateway', NatGatewaySchema)
export class NatGateway extends ATerraformResource<NatGatewaySchema, NatGateway> {
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
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'connectivity_type is force-new on aws_nat_gateway; a change recreates it',
        ),
      ];
    }

    return [];
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const natGatewayOctoResource = terraform.addOctoTerraformResource(this as NatGateway, {
      explicitParents: [this.parents[0], this.parents[1]],
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const eipTFResource = natGatewayOctoResource.addTerraformResource('aws_eip', `${this.resourceId}_eip`, {
      domain: 'vpc',
    });

    const natGatewayTFResource = natGatewayOctoResource.addTerraformResource('aws_nat_gateway', this.resourceId, {
      allocation_id: terraform.raw(`${eipTFResource.address}.id`),
      connectivity_type: this.properties.ConnectivityType,
      subnet_id: terraform.getRef(this.parents[2], 'SubnetId'),
    });
    natGatewayOctoResource.output({
      AllocationId: terraform.raw(`${eipTFResource.address}.id`),
      NatGatewayId: terraform.raw(`${natGatewayTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      eipTFResource.attribute('tags', this.tags);
      natGatewayTFResource.attribute('tags', this.tags);
    }
  }
}
