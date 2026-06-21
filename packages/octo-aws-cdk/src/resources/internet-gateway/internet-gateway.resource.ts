import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { InternetGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends ATerraformResource<InternetGatewaySchema, InternetGateway> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: InternetGatewaySchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: InternetGateway): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'internet gateway properties are identity; a change recreates it',
        ),
      ];
    }

    return [];
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const igwOctoResource = terraform.addOctoTerraformResource(this as InternetGateway, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const igwTFResource = igwOctoResource.addTerraformResource('aws_internet_gateway', this.resourceId, {
      vpc_id: terraform.getRef(this.parents[0], 'VpcId'),
    });
    igwOctoResource.output({
      InternetGatewayArn: terraform.raw(`${igwTFResource.address}.arn`),
      InternetGatewayId: terraform.raw(`${igwTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      igwTFResource.attribute('tags', this.tags);
    }
  }
}
