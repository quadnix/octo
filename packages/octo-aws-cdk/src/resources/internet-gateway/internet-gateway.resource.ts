import { Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { InternetGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends ATFResource<InternetGatewaySchema, InternetGateway> {
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
      throw new ResourceError('Cannot update Internet Gateway immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const igwOctoResource = octoTerraform.addOctoTerraformResource(this as InternetGateway);
    const igwTFResource = igwOctoResource.addTerraformResource('aws_internet_gateway', this.resourceId, {
      vpc_id: octoTerraform.getRef(this.parents[0], 'VpcId'),
    });
    if (Object.keys(this.tags).length > 0) {
      igwTFResource.attribute('tags', this.tags);
    }
    igwOctoResource.output({
      InternetGatewayArn: octoTerraform.raw(`${igwTFResource.address}.arn`),
      InternetGatewayId: octoTerraform.raw(`${igwTFResource.address}.id`),
    });
  }
}
